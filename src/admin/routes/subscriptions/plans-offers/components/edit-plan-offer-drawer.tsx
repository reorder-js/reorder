import { zodResolver } from "@hookform/resolvers/zod"
import { Trash } from "@medusajs/icons"
import {
  Alert,
  Button,
  Drawer,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { z } from "zod"
import { sdk } from "../../../../lib/client"
import {
  PlanOfferAdminDetailResponse,
  PlanOfferDiscountType,
  PlanOfferFrequencyInterval,
} from "../../../../types/plan-offer"
import {
  adminPlanOffersQueryKeys,
  useAdminPlanOfferDetailQuery,
} from "../data-loading"

const frequencyRowSchema = z.object({
  interval: z.nativeEnum(PlanOfferFrequencyInterval),
  value: z.number().int().positive(),
  has_discount: z.boolean(),
  discount_type: z.nativeEnum(PlanOfferDiscountType),
  discount_value: z.number().positive().nullable(),
})

const editPlanOfferSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    is_enabled: z.boolean(),
    minimum_cycles: z.number().int().positive().nullable(),
    trial_enabled: z.boolean(),
    trial_days: z.number().int().positive().nullable(),
    stacking_policy: z.enum([
      "allowed",
      "disallow_all",
      "disallow_subscription_discounts",
    ]),
    frequency_rows: z.array(frequencyRowSchema).min(1),
  })
  .superRefine((values, ctx) => {
    const seen = new Set<string>()

    values.frequency_rows.forEach((row, index) => {
      const key = `${row.interval}:${row.value}`

      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Frequency must be unique",
          path: ["frequency_rows", index, "value"],
        })
      }

      seen.add(key)

      if (row.has_discount && row.discount_value === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Discount value is required",
          path: ["frequency_rows", index, "discount_value"],
        })
      }
    })

    if (!values.trial_enabled && values.trial_days !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Trial days must be empty when trial is disabled",
        path: ["trial_days"],
      })
    }

    if (values.trial_enabled && values.trial_days === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Trial days is required when trial is enabled",
        path: ["trial_days"],
      })
    }
  })

type EditPlanOfferFormValues = z.infer<typeof editPlanOfferSchema>

type EditPlanOfferDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  planOfferId?: string
}

export const EditPlanOfferDrawer = ({
  open,
  onOpenChange,
  planOfferId,
}: EditPlanOfferDrawerProps) => {
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error } = useAdminPlanOfferDetailQuery(
    planOfferId,
    open
  )

  const form = useForm<EditPlanOfferFormValues>({
    resolver: zodResolver(editPlanOfferSchema),
    defaultValues: {
      name: "",
      is_enabled: true,
      minimum_cycles: null,
      trial_enabled: false,
      trial_days: null,
      stacking_policy: "allowed",
      frequency_rows: [],
    },
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "frequency_rows",
  })

  useEffect(() => {
    if (!open || !data?.plan_offer) {
      return
    }

    const detail = data.plan_offer
    const nextRows = detail.allowed_frequencies.map((frequency) => {
      const matchingDiscount = detail.discounts.find(
        (discount) =>
          discount.interval === frequency.interval &&
          discount.frequency_value === frequency.value
      )

      return {
        interval: frequency.interval,
        value: frequency.value,
        has_discount: Boolean(matchingDiscount),
        discount_type:
          matchingDiscount?.type ?? PlanOfferDiscountType.PERCENTAGE,
        discount_value: matchingDiscount?.value ?? null,
      }
    })

    form.reset({
      name: detail.name,
      is_enabled: detail.is_enabled,
      minimum_cycles: detail.rules?.minimum_cycles ?? null,
      trial_enabled: detail.rules?.trial_enabled ?? false,
      trial_days: detail.rules?.trial_days ?? null,
      stacking_policy: detail.rules?.stacking_policy ?? "allowed",
      frequency_rows: nextRows,
    })
    replace(nextRows)
  }, [data, form, open, replace])

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      is_enabled: boolean
      allowed_frequencies: Array<{
        interval: PlanOfferFrequencyInterval
        value: number
      }>
      discounts: Array<{
        interval: PlanOfferFrequencyInterval
        frequency_value: number
        type: PlanOfferDiscountType
        value: number
      }>
    }) =>
      sdk.client.fetch<PlanOfferAdminDetailResponse>(
        `/admin/subscription-offers/${planOfferId}`,
        {
          method: "POST",
          body: payload,
        }
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: adminPlanOffersQueryKeys.all,
        }),
        planOfferId
          ? queryClient.invalidateQueries({
              queryKey: adminPlanOffersQueryKeys.detail(planOfferId),
            })
          : Promise.resolve(),
      ])
      toast.success("Plan offer updated")
      onOpenChange(false)
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update plan offer"
      )
    },
  })

  const handleSubmit = form.handleSubmit((values) => {
    updateMutation.mutate({
      name: values.name,
      is_enabled: values.is_enabled,
      allowed_frequencies: values.frequency_rows.map((row) => ({
        interval: row.interval,
        value: row.value,
      })),
      discounts: values.frequency_rows
        .filter((row) => row.has_discount && row.discount_value !== null)
        .map((row) => ({
          interval: row.interval,
          frequency_value: row.value,
          type: row.discount_type,
          value: row.discount_value!,
        })),
      rules: {
        minimum_cycles: values.minimum_cycles,
        trial_enabled: values.trial_enabled,
        trial_days: values.trial_enabled ? values.trial_days : null,
        stacking_policy: values.stacking_policy,
      },
    })
  })

  const detail = data?.plan_offer
  const trialEnabled = form.watch("trial_enabled")

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content className="flex flex-col overflow-hidden">
        <Drawer.Header>
          <Drawer.Title>Edit plan offer</Drawer.Title>
        </Drawer.Header>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <Drawer.Body className="flex min-h-0 flex-1 flex-col gap-y-6 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center gap-x-2 text-ui-fg-subtle">
                <div className="bg-ui-fg-subtle size-2 rounded-full" />
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  Loading plan offer...
                </Text>
              </div>
            ) : null}
            {isError ? (
              <Alert variant="error">
                {error instanceof Error ? error.message : "Failed to load plan offer."}
              </Alert>
            ) : null}
            {!isLoading && !isError && detail ? (
              <>
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-name">Name</Label>
                    <Input id="edit-name" {...form.register("name")} />
                    <FieldError message={form.formState.errors.name?.message} />
                  </div>

                  <div className="grid gap-3 rounded-lg border border-ui-border-base p-4">
                    <div className="grid gap-1">
                      <Text size="small" leading="compact" weight="plus">
                        Target
                      </Text>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        {detail.target.product_title}
                        {detail.target.variant_title
                          ? ` · ${detail.target.variant_title}`
                          : ""}
                      </Text>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        {detail.target.scope === "product"
                          ? "Product-level configuration"
                          : "Variant-level configuration"}
                      </Text>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between rounded-lg border border-ui-border-base px-4 py-3">
                      <div className="flex flex-col">
                        <Text size="small" leading="compact" weight="plus">
                          Offer enabled
                        </Text>
                        <Text
                          size="small"
                          leading="compact"
                          className="text-ui-fg-subtle"
                        >
                          Enable or disable this configuration.
                        </Text>
                      </div>
                      <Controller
                        control={form.control}
                        name="is_enabled"
                        render={({ field }) => (
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <Heading level="h2">Frequencies</Heading>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        Update allowed frequencies and their discounts.
                      </Text>
                    </div>
                    <Button
                      type="button"
                      size="small"
                      variant="secondary"
                      onClick={() =>
                        append({
                          interval: PlanOfferFrequencyInterval.MONTH,
                          value: 1,
                          has_discount: false,
                          discount_type: PlanOfferDiscountType.PERCENTAGE,
                          discount_value: null,
                        })
                      }
                    >
                      Add frequency
                    </Button>
                  </div>

                  <div className="grid gap-4 rounded-lg border border-ui-border-base p-4">
                    <div className="flex flex-col gap-y-1">
                      <Heading level="h2">Offer rules</Heading>
                      <Text
                        size="small"
                        leading="compact"
                        className="text-ui-fg-subtle"
                      >
                        Update minimum period, trial behavior, and stacking
                        policy.
                      </Text>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="edit-minimum-cycles">Minimum cycles</Label>
                        <Input
                          id="edit-minimum-cycles"
                          type="number"
                          min={1}
                          step={1}
                          {...form.register("minimum_cycles", {
                            setValueAs: (value) =>
                              value === "" ? null : Number(value),
                          })}
                        />
                        <Text
                          size="small"
                          leading="compact"
                          className="text-ui-fg-subtle"
                        >
                          Leave empty if there is no minimum subscription
                          period.
                        </Text>
                        <FieldError
                          message={form.formState.errors.minimum_cycles?.message}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="edit-stacking-policy">Stacking policy</Label>
                        <Controller
                          control={form.control}
                          name="stacking_policy"
                          render={({ field }) => (
                            <Select
                              value={field.value}
                              onValueChange={field.onChange}
                            >
                              <Select.Trigger id="edit-stacking-policy">
                                <Select.Value />
                              </Select.Trigger>
                              <Select.Content>
                                <Select.Item value="allowed">Allowed</Select.Item>
                                <Select.Item value="disallow_all">
                                  Disallow all
                                </Select.Item>
                                <Select.Item value="disallow_subscription_discounts">
                                  Disallow subscription discounts
                                </Select.Item>
                              </Select.Content>
                            </Select>
                          )}
                        />
                        <Text
                          size="small"
                          leading="compact"
                          className="text-ui-fg-subtle"
                        >
                          Control whether this offer can stack with other discounts.
                        </Text>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="flex items-center justify-between rounded-lg border border-ui-border-base px-4 py-3">
                        <div className="flex flex-col">
                          <Text size="small" leading="compact" weight="plus">
                            Trial enabled
                          </Text>
                          <Text
                            size="small"
                            leading="compact"
                            className="text-ui-fg-subtle"
                          >
                            Allow a trial period for this offer.
                          </Text>
                        </div>
                        <Controller
                          control={form.control}
                          name="trial_enabled"
                          render={({ field }) => (
                            <Switch
                              checked={field.value}
                              onCheckedChange={(checked) => {
                                field.onChange(checked)

                                if (!checked) {
                                  form.setValue("trial_days", null, {
                                    shouldValidate: true,
                                  })
                                }
                              }}
                            />
                          )}
                        />
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="edit-trial-days">Trial days</Label>
                        <Input
                          id="edit-trial-days"
                          type="number"
                          min={1}
                          step={1}
                          disabled={!trialEnabled}
                          {...form.register("trial_days", {
                            setValueAs: (value) =>
                              value === "" ? null : Number(value),
                          })}
                        />
                        <FieldError
                          message={form.formState.errors.trial_days?.message}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="grid gap-4 rounded-lg border border-ui-border-base p-4"
                      >
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_140px_auto]">
                          <div className="grid gap-2">
                            <Label>Interval</Label>
                            <Controller
                              control={form.control}
                              name={`frequency_rows.${index}.interval`}
                              render={({ field: controllerField }) => (
                                <Select
                                  value={controllerField.value}
                                  onValueChange={controllerField.onChange}
                                >
                                  <Select.Trigger>
                                    <Select.Value />
                                  </Select.Trigger>
                                  <Select.Content>
                                    <Select.Item value={PlanOfferFrequencyInterval.WEEK}>
                                      Weekly
                                    </Select.Item>
                                    <Select.Item value={PlanOfferFrequencyInterval.MONTH}>
                                      Monthly
                                    </Select.Item>
                                    <Select.Item value={PlanOfferFrequencyInterval.YEAR}>
                                      Yearly
                                    </Select.Item>
                                  </Select.Content>
                                </Select>
                              )}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Value</Label>
                            <Input
                              type="number"
                              min={1}
                              step={1}
                              {...form.register(`frequency_rows.${index}.value`, {
                                valueAsNumber: true,
                              })}
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="button"
                              size="small"
                              variant="secondary"
                              disabled={fields.length === 1}
                              onClick={() => remove(index)}
                            >
                              <Trash />
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-3">
                          <div className="flex items-center justify-between rounded-lg border border-ui-border-base px-4 py-3">
                            <div className="flex flex-col">
                              <Text size="small" leading="compact" weight="plus">
                                Discount for this frequency
                              </Text>
                              <Text
                                size="small"
                                leading="compact"
                                className="text-ui-fg-subtle"
                              >
                                Enable only if this frequency should have a discount.
                              </Text>
                            </div>
                            <Controller
                              control={form.control}
                              name={`frequency_rows.${index}.has_discount`}
                              render={({ field: controllerField }) => (
                                <Switch
                                  checked={controllerField.value}
                                  onCheckedChange={controllerField.onChange}
                                />
                              )}
                            />
                          </div>

                          {form.watch(`frequency_rows.${index}.has_discount`) ? (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <div className="grid gap-2">
                                <Label>Discount type</Label>
                                <Controller
                                  control={form.control}
                                  name={`frequency_rows.${index}.discount_type`}
                                  render={({ field: controllerField }) => (
                                    <Select
                                      value={controllerField.value}
                                      onValueChange={controllerField.onChange}
                                    >
                                      <Select.Trigger>
                                        <Select.Value />
                                      </Select.Trigger>
                                      <Select.Content>
                                        <Select.Item
                                          value={PlanOfferDiscountType.PERCENTAGE}
                                        >
                                          Percentage
                                        </Select.Item>
                                        <Select.Item value={PlanOfferDiscountType.FIXED}>
                                          Fixed
                                        </Select.Item>
                                      </Select.Content>
                                    </Select>
                                  )}
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label>Discount value</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step={0.01}
                                  {...form.register(
                                    `frequency_rows.${index}.discount_value`,
                                    {
                                      setValueAs: (value) =>
                                        value === "" ? null : Number(value),
                                    }
                                  )}
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <FieldError
                          message={
                            form.formState.errors.frequency_rows?.[index]?.value
                              ?.message ||
                            form.formState.errors.frequency_rows?.[index]
                              ?.discount_value?.message
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </Drawer.Body>
          <Drawer.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <Drawer.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={updateMutation.isPending}
                >
                  Cancel
                </Button>
              </Drawer.Close>
              <Button
                size="small"
                type="submit"
                isLoading={updateMutation.isPending}
                disabled={isLoading || isError || !detail}
              >
                Save
              </Button>
            </div>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const FieldError = ({ message }: { message?: string }) => {
  if (!message) {
    return null
  }

  return (
    <Text size="small" leading="compact" className="text-ui-fg-error">
      {message}
    </Text>
  )
}
