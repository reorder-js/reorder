import { zodResolver } from "@hookform/resolvers/zod"
import { HttpTypes } from "@medusajs/framework/types"
import { Plus, Trash } from "@medusajs/icons"
import {
  Button,
  FocusModal,
  Heading,
  Input,
  Label,
  Select,
  Switch,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useFieldArray, useForm, Controller } from "react-hook-form"
import { z } from "zod"
import { sdk } from "../../../../lib/client"
import {
  CreatePlanOfferAdminRequest,
  PlanOfferAdminDetailResponse,
  PlanOfferDiscountType,
  PlanOfferFrequencyInterval,
  PlanOfferScope,
} from "../../../../types/plan-offer"
import { adminPlanOffersQueryKeys } from "../data-loading"
import {
  PlanOfferProductPickerModal,
  PlanOfferVariantPickerModal,
} from "./selection-modals"

const frequencyRowSchema = z.object({
  interval: z.nativeEnum(PlanOfferFrequencyInterval),
  value: z.number().int().positive(),
  has_discount: z.boolean(),
  discount_type: z.nativeEnum(PlanOfferDiscountType),
  discount_value: z.number().positive().nullable(),
})

const createPlanOfferSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    scope: z.nativeEnum(PlanOfferScope),
    product_id: z.string().trim().min(1),
    product_title: z.string().trim().min(1),
    variant_id: z.string().trim().optional().nullable(),
    variant_title: z.string().trim().optional().nullable(),
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
    if (values.scope === PlanOfferScope.VARIANT && !values.variant_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a variant",
        path: ["variant_id"],
      })
    }

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

type CreatePlanOfferFormValues = z.infer<typeof createPlanOfferSchema>

type CreatePlanOfferModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const defaultValues: CreatePlanOfferFormValues = {
  name: "",
  scope: PlanOfferScope.PRODUCT,
  product_id: "",
  product_title: "",
  variant_id: null,
  variant_title: null,
  is_enabled: true,
  minimum_cycles: null,
  trial_enabled: false,
  trial_days: null,
  stacking_policy: "allowed",
  frequency_rows: [
    {
      interval: PlanOfferFrequencyInterval.MONTH,
      value: 1,
      has_discount: false,
      discount_type: PlanOfferDiscountType.PERCENTAGE,
      discount_value: null,
    },
  ],
}

export const CreatePlanOfferModal = ({
  open,
  onOpenChange,
}: CreatePlanOfferModalProps) => {
  const queryClient = useQueryClient()
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [variantPickerOpen, setVariantPickerOpen] = useState(false)

  const form = useForm<CreatePlanOfferFormValues>({
    resolver: zodResolver(createPlanOfferSchema),
    defaultValues,
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "frequency_rows",
  })

  const scope = form.watch("scope")
  const productId = form.watch("product_id")
  const productTitle = form.watch("product_title")
  const variantId = form.watch("variant_id")
  const variantTitle = form.watch("variant_title")
  const trialEnabled = form.watch("trial_enabled")

  useEffect(() => {
    if (open) {
      return
    }

    form.reset(defaultValues)
    setProductPickerOpen(false)
    setVariantPickerOpen(false)
  }, [form, open])

  const createMutation = useMutation({
    mutationFn: async (payload: CreatePlanOfferAdminRequest) =>
      sdk.client.fetch<PlanOfferAdminDetailResponse>("/admin/subscription-offers", {
        method: "POST",
        body: payload,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: adminPlanOffersQueryKeys.all,
      })
      toast.success("Plan offer created")
      form.reset(defaultValues)
      onOpenChange(false)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to create plan offer"
      )
    },
  })

  const handleSubmit = form.handleSubmit((values) => {
    const payload: CreatePlanOfferAdminRequest = {
      name: values.name,
      scope: values.scope,
      product_id: values.product_id,
      variant_id:
        values.scope === PlanOfferScope.VARIANT ? values.variant_id ?? null : null,
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
    }

    createMutation.mutate(payload)
  })

  return (
    <>
      <PlanOfferProductPickerModal
        open={productPickerOpen}
        onOpenChange={setProductPickerOpen}
        selectedProductId={productId || undefined}
        onSelect={(product: HttpTypes.AdminProduct) => {
          form.setValue("product_id", product.id, { shouldValidate: true })
          form.setValue("product_title", product.title, { shouldValidate: true })
          form.setValue("variant_id", null)
          form.setValue("variant_title", null)
        }}
      />
      <PlanOfferVariantPickerModal
        open={variantPickerOpen}
        onOpenChange={setVariantPickerOpen}
        productId={productId || undefined}
        productTitle={productTitle || undefined}
        selectedVariantId={variantId || undefined}
        onSelect={(variant: HttpTypes.AdminProductVariant) => {
          form.setValue("variant_id", variant.id, { shouldValidate: true })
          form.setValue("variant_title", variant.title, { shouldValidate: true })
        }}
      />
      <FocusModal open={open} onOpenChange={onOpenChange}>
        <FocusModal.Content>
          <form
            onSubmit={handleSubmit}
            className="flex h-full flex-col overflow-hidden"
          >
            <FocusModal.Header>
              <div className="flex items-center justify-end gap-x-2">
                <FocusModal.Close asChild>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={createMutation.isPending}
                  >
                    Cancel
                  </Button>
                </FocusModal.Close>
                <Button
                  type="submit"
                  size="small"
                  isLoading={createMutation.isPending}
                >
                  Create
                </Button>
              </div>
            </FocusModal.Header>
            <FocusModal.Body className="flex-1 overflow-y-auto">
              <div className="flex flex-1 flex-col items-center overflow-y-auto">
                <div className="mx-auto flex w-full max-w-[720px] flex-col gap-y-8 px-2 py-16">
                  <div className="flex flex-col gap-y-1">
                    <Heading>Create plan offer</Heading>
                    <Text
                      size="small"
                      leading="compact"
                      className="text-ui-fg-subtle"
                    >
                      Create a product-level or variant-level subscription offer.
                    </Text>
                  </div>

                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="create-name">Name</Label>
                      <Input id="create-name" {...form.register("name")} />
                      <FieldError message={form.formState.errors.name?.message} />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="create-scope">Scope</Label>
                      <Controller
                        control={form.control}
                        name="scope"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value)
                              if (value === PlanOfferScope.PRODUCT) {
                                form.setValue("variant_id", null)
                                form.setValue("variant_title", null)
                              }
                            }}
                          >
                            <Select.Trigger id="create-scope">
                              <Select.Value />
                            </Select.Trigger>
                            <Select.Content>
                              <Select.Item value={PlanOfferScope.PRODUCT}>
                                Product
                              </Select.Item>
                              <Select.Item value={PlanOfferScope.VARIANT}>
                                Variant
                              </Select.Item>
                            </Select.Content>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="grid gap-3 rounded-lg border border-ui-border-base p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <Text size="small" leading="compact" weight="plus">
                            Product
                          </Text>
                          <Text
                            size="small"
                            leading="compact"
                            className="text-ui-fg-subtle"
                          >
                            {productTitle || "No product selected"}
                          </Text>
                        </div>
                        <Button
                          type="button"
                          size="small"
                          variant="secondary"
                          onClick={() => setProductPickerOpen(true)}
                        >
                          {productId ? "Change" : "Select"}
                        </Button>
                      </div>
                      <FieldError
                        message={
                          form.formState.errors.product_id?.message ||
                          form.formState.errors.product_title?.message
                        }
                      />
                    </div>

                    {scope === PlanOfferScope.VARIANT ? (
                      <div className="grid gap-3 rounded-lg border border-ui-border-base p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <Text size="small" leading="compact" weight="plus">
                              Variant
                            </Text>
                            <Text
                              size="small"
                              leading="compact"
                              className="text-ui-fg-subtle"
                            >
                              {variantTitle || "No variant selected"}
                            </Text>
                          </div>
                          <Button
                            type="button"
                            size="small"
                            variant="secondary"
                            disabled={!productId}
                            onClick={() => setVariantPickerOpen(true)}
                          >
                            {variantId ? "Change" : "Select"}
                          </Button>
                        </div>
                        <FieldError message={form.formState.errors.variant_id?.message} />
                      </div>
                    ) : null}

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
                            Enable this offer as soon as it is created.
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

                    <div className="grid gap-4 rounded-lg border border-ui-border-base p-4">
                      <div className="flex flex-col gap-y-1">
                        <Heading level="h2">Offer rules</Heading>
                        <Text
                          size="small"
                          leading="compact"
                          className="text-ui-fg-subtle"
                        >
                          Define optional offer constraints such as minimum
                          period, trial behavior, and stacking policy.
                        </Text>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="minimum-cycles">Minimum cycles</Label>
                          <Input
                            id="minimum-cycles"
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
                          <Label htmlFor="stacking-policy">Stacking policy</Label>
                          <Controller
                            control={form.control}
                            name="stacking_policy"
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <Select.Trigger id="stacking-policy">
                                  <Select.Value />
                                </Select.Trigger>
                                <Select.Content>
                                  <Select.Item value="allowed">
                                    Allowed
                                  </Select.Item>
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
                          <Label htmlFor="trial-days">Trial days</Label>
                          <Input
                            id="trial-days"
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
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <Heading level="h2">Frequencies</Heading>
                          <Text
                            size="small"
                            leading="compact"
                            className="text-ui-fg-subtle"
                          >
                            Define allowed frequencies and optional discounts.
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
                          <Plus />
                          Add frequency
                        </Button>
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
                                            <Select.Item
                                              value={PlanOfferDiscountType.FIXED}
                                            >
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
                                form.formState.errors.frequency_rows?.[index]?.discount_value
                                  ?.message
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FocusModal.Body>
          </form>
        </FocusModal.Content>
      </FocusModal>
    </>
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
