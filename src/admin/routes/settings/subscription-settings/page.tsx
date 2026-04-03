import { zodResolver } from "@hookform/resolvers/zod"
import { defineRouteConfig } from "@medusajs/admin-sdk"
import { PlusMini, Trash } from "@medusajs/icons"
import {
  Alert,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import { z } from "zod"
import type {
  AdminSubscriptionCancellationBehavior,
  AdminSubscriptionRenewalBehavior,
} from "../../../types/settings"
import {
  adminSubscriptionSettingsQueryKeys,
  updateAdminSubscriptionSettings,
  useAdminSubscriptionSettingsQuery,
} from "./data-loading"

const renewalBehaviorOptions: Array<{
  value: AdminSubscriptionRenewalBehavior
  label: string
  hint: string
}> = [
  {
    value: "process_immediately",
    label: "Process immediately",
    hint: "New renewal cycles default to immediate processing when no reviewable change is pending.",
  },
  {
    value: "require_review_for_pending_changes",
    label: "Review pending changes",
    hint: "New renewal cycles require approval when a pending subscription update becomes applicable.",
  },
]

const cancellationBehaviorOptions: Array<{
  value: AdminSubscriptionCancellationBehavior
  label: string
  hint: string
}> = [
  {
    value: "recommend_retention_first",
    label: "Recommend retention first",
    hint: "New cancellation cases start with a retention-first posture before direct cancellation.",
  },
  {
    value: "allow_direct_cancellation",
    label: "Allow direct cancellation",
    hint: "New cancellation cases can proceed directly to cancellation without a retention-first default.",
  },
]

const settingsSchema = z
  .object({
    default_trial_days: z.number().int().min(0),
    dunning_retry_intervals: z
      .array(
        z.object({
          value: z.number().int().positive(),
        })
      )
      .min(1),
    max_dunning_attempts: z.number().int().positive(),
    default_renewal_behavior: z.enum([
      "process_immediately",
      "require_review_for_pending_changes",
    ]),
    default_cancellation_behavior: z.enum([
      "recommend_retention_first",
      "allow_direct_cancellation",
    ]),
  })
  .superRefine((values, ctx) => {
    const intervals = values.dunning_retry_intervals.map((item) => item.value)

    intervals.forEach((interval, index) => {
      if (!Number.isInteger(interval) || interval <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Retry interval must be a positive integer",
          path: ["dunning_retry_intervals", index, "value"],
        })
      }

      if (index > 0 && interval <= intervals[index - 1]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Retry intervals must be strictly increasing",
          path: ["dunning_retry_intervals", index, "value"],
        })
      }
    })

    if (values.max_dunning_attempts !== intervals.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Max dunning attempts must match the number of retry intervals",
        path: ["max_dunning_attempts"],
      })
    }
  })

type SubscriptionSettingsFormValues = z.infer<typeof settingsSchema>

const defaultFormValues: SubscriptionSettingsFormValues = {
  default_trial_days: 0,
  dunning_retry_intervals: [{ value: 1440 }, { value: 4320 }, { value: 10080 }],
  max_dunning_attempts: 3,
  default_renewal_behavior: "process_immediately",
  default_cancellation_behavior: "recommend_retention_first",
}

function getChangedSections(
  dirtyFields: Partial<Record<keyof SubscriptionSettingsFormValues, unknown>>
) {
  const sections: string[] = []

  if (dirtyFields.default_trial_days) {
    sections.push("Trial")
  }

  if (
    dirtyFields.dunning_retry_intervals ||
    dirtyFields.max_dunning_attempts
  ) {
    sections.push("Dunning")
  }

  if (dirtyFields.default_renewal_behavior) {
    sections.push("Renewals")
  }

  if (dirtyFields.default_cancellation_behavior) {
    sections.push("Cancellation")
  }

  return sections
}

const SubscriptionSettingsPage = () => {
  const queryClient = useQueryClient()
  const {
    data,
    isLoading,
    isError,
    error,
  } = useAdminSubscriptionSettingsQuery()

  const form = useForm<SubscriptionSettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaultFormValues,
  })

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "dunning_retry_intervals",
  })

  useEffect(() => {
    const settings = data?.subscription_settings

    if (!settings) {
      return
    }

    const nextValues: SubscriptionSettingsFormValues = {
      default_trial_days: settings.default_trial_days,
      dunning_retry_intervals: settings.dunning_retry_intervals.map((value) => ({
        value,
      })),
      max_dunning_attempts: settings.max_dunning_attempts,
      default_renewal_behavior: settings.default_renewal_behavior,
      default_cancellation_behavior: settings.default_cancellation_behavior,
    }

    form.reset(nextValues)
    replace(nextValues.dunning_retry_intervals)
  }, [data, form, replace])

  const saveMutation = useMutation({
    mutationFn: async (values: SubscriptionSettingsFormValues) => {
      const currentVersion = data?.subscription_settings.version ?? 0

      return await updateAdminSubscriptionSettings({
        default_trial_days: values.default_trial_days,
        dunning_retry_intervals: values.dunning_retry_intervals.map(
          (item) => item.value
        ),
        max_dunning_attempts: values.max_dunning_attempts,
        default_renewal_behavior: values.default_renewal_behavior,
        default_cancellation_behavior: values.default_cancellation_behavior,
        expected_version: currentVersion,
      })
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: adminSubscriptionSettingsQueryKeys.all,
      })

      form.reset({
        default_trial_days:
          response.subscription_settings.default_trial_days,
        dunning_retry_intervals:
          response.subscription_settings.dunning_retry_intervals.map(
            (value) => ({ value })
          ),
        max_dunning_attempts:
          response.subscription_settings.max_dunning_attempts,
        default_renewal_behavior:
          response.subscription_settings.default_renewal_behavior,
        default_cancellation_behavior:
          response.subscription_settings.default_cancellation_behavior,
      })

      toast.success("Subscription settings updated")
    },
    onError: (mutationError) => {
      const message =
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update subscription settings"

      if (
        message.toLowerCase().includes("version") ||
        message.toLowerCase().includes("conflict")
      ) {
        toast.error(
          "Settings changed in another session. Refresh the page and try saving again."
        )
        return
      }

      toast.error(
        message
      )
    },
  })

  const handleSubmit = form.handleSubmit((values) => {
    saveMutation.mutate(values)
  })

  if (isLoading) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Subscription Settings</Heading>
          <Text
            size="small"
            leading="compact"
            className="text-ui-fg-subtle"
          >
            Loading current runtime configuration…
          </Text>
        </div>
      </Container>
    )
  }

  if (isError) {
    return (
      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h1">Subscription Settings</Heading>
        </div>
        <div className="px-6 py-4">
          <Alert variant="error">
            <Text size="small" leading="compact">
              {error instanceof Error
                ? error.message
                : "Failed to load subscription settings"}
            </Text>
          </Alert>
        </div>
      </Container>
    )
  }

  const currentSettings = data?.subscription_settings
  const changedSections = getChangedSections(form.formState.dirtyFields)
  const hasWideImpactChanges = changedSections.some((section) =>
    ["Dunning", "Renewals", "Cancellation"].includes(section)
  )

  return (
    <form onSubmit={handleSubmit}>
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between px-6 py-4">
          <div className="flex flex-col">
            <Text
              size="small"
              leading="compact"
              className="text-ui-fg-subtle"
            >
              Settings
            </Text>
            <Heading level="h1">Subscription Settings</Heading>
            <Text
              size="small"
              leading="compact"
              className="text-ui-fg-subtle"
            >
              Manage runtime defaults for trials, dunning, renewals, and
              cancellation flows.
            </Text>
            <Text
              size="small"
              leading="compact"
              className="mt-2 text-ui-fg-subtle"
            >
              Changes apply to future operations and newly created process
              state. Existing active dunning, cancellation, and renewal
              processes keep their persisted configuration.
            </Text>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Button
              size="small"
              type="submit"
              isLoading={saveMutation.isPending}
              disabled={saveMutation.isPending || !form.formState.isDirty}
            >
              Save
            </Button>
            <Text
              size="small"
              leading="compact"
              className="text-ui-fg-subtle"
            >
              {saveMutation.isPending
                ? "Saving updated defaults…"
                : form.formState.isDirty
                  ? "Changes will apply after this save completes."
                  : "No unsaved changes."}
            </Text>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-6 py-4">
          {currentSettings && (
            <Alert variant="info">
              <div className="flex flex-col gap-1">
                <Text size="small" leading="compact">
                  {currentSettings.is_persisted
                    ? `Persisted version ${currentSettings.version}`
                    : "Using fallback defaults until the first save"}
                </Text>
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  {currentSettings.updated_at
                    ? `Last updated at ${new Date(
                        currentSettings.updated_at
                      ).toLocaleString()}`
                    : "No persisted settings record exists yet."}
                </Text>
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  {currentSettings.updated_by
                    ? `Updated by ${currentSettings.updated_by}`
                    : "Updated by system bootstrap or no actor recorded."}
                </Text>
              </div>
            </Alert>
          )}

          {form.formState.isDirty && (
            <Alert variant="warning">
              <div className="flex flex-col gap-1">
                <Text size="small" leading="compact" weight="plus">
                  Unsaved changes in: {changedSections.join(", ")}
                </Text>
                <Text size="small" leading="compact">
                  {hasWideImpactChanges
                    ? "These changes affect defaults for future renewal, dunning, or cancellation operations. Existing active cases keep their persisted process state."
                    : "These changes update global defaults for future subscription operations."}
                </Text>
              </div>
            </Alert>
          )}

          <fieldset
            disabled={saveMutation.isPending}
            className="flex flex-col gap-4 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <SettingsSection
              title="Trial"
              description="Configure the default trial period applied to future subscription operations."
            >
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="default_trial_days">Default trial days</Label>
                <Input
                  id="default_trial_days"
                  type="number"
                  min={0}
                  step={1}
                  {...form.register("default_trial_days", {
                    valueAsNumber: true,
                  })}
                />
                <FieldError message={form.formState.errors.default_trial_days?.message} />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Dunning"
              description="Define the retry schedule used when a new dunning case is created."
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <Label>Retry intervals</Label>
                    <Text
                      size="small"
                      leading="compact"
                      className="text-ui-fg-subtle"
                    >
                      Values are stored in minutes and must be strictly increasing.
                    </Text>
                  </div>
                  <Button
                    size="small"
                    variant="secondary"
                    type="button"
                    onClick={() => {
                      const lastValue =
                        fields[fields.length - 1]?.value ?? 10080

                      append({ value: Number(lastValue) + 1440 })
                    }}
                  >
                    <PlusMini />
                    Add interval
                  </Button>
                </div>

                <div className="flex flex-col gap-3">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="grid grid-cols-[1fr_auto] items-start gap-2"
                    >
                      <div className="flex flex-col gap-y-2">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          {...form.register(
                            `dunning_retry_intervals.${index}.value`,
                            {
                              valueAsNumber: true,
                            }
                          )}
                        />
                        <FieldError
                          message={
                            form.formState.errors.dunning_retry_intervals?.[index]
                              ?.value?.message
                          }
                        />
                      </div>
                      <Button
                        size="small"
                        variant="secondary"
                        type="button"
                        disabled={fields.length === 1}
                        onClick={() => remove(index)}
                      >
                        <Trash />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-y-2">
                  <Label htmlFor="max_dunning_attempts">Max dunning attempts</Label>
                  <Input
                    id="max_dunning_attempts"
                    type="number"
                    min={1}
                    step={1}
                    {...form.register("max_dunning_attempts", {
                      valueAsNumber: true,
                    })}
                  />
                  <FieldError
                    message={form.formState.errors.max_dunning_attempts?.message}
                  />
                </div>
              </div>
            </SettingsSection>

            <SettingsSection
              title="Renewals"
              description="Choose the default behavior used when a new renewal cycle is created."
            >
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="default_renewal_behavior">
                  Default renewal behavior
                </Label>
                <Controller
                  control={form.control}
                  name="default_renewal_behavior"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <Select.Trigger id="default_renewal_behavior">
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {renewalBehaviorOptions.map((option) => (
                          <Select.Item key={option.value} value={option.value}>
                            {option.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  )}
                />
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  {
                    renewalBehaviorOptions.find(
                      (option) =>
                        option.value ===
                        form.watch("default_renewal_behavior")
                    )?.hint
                  }
                </Text>
                <FieldError
                  message={form.formState.errors.default_renewal_behavior?.message}
                />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Cancellation Defaults"
              description="Define how newly created cancellation cases should start."
            >
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="default_cancellation_behavior">
                  Default cancellation behavior
                </Label>
                <Controller
                  control={form.control}
                  name="default_cancellation_behavior"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <Select.Trigger id="default_cancellation_behavior">
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        {cancellationBehaviorOptions.map((option) => (
                          <Select.Item key={option.value} value={option.value}>
                            {option.label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  )}
                />
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  {
                    cancellationBehaviorOptions.find(
                      (option) =>
                        option.value ===
                        form.watch("default_cancellation_behavior")
                    )?.hint
                  }
                </Text>
                <FieldError
                  message={
                    form.formState.errors.default_cancellation_behavior?.message
                  }
                />
              </div>
            </SettingsSection>
          </fieldset>
        </div>
      </Container>
    </form>
  )
}

type SettingsSectionProps = {
  title: string
  description: string
  children: ReactNode
}

const SettingsSection = ({
  title,
  description,
  children,
}: SettingsSectionProps) => {
  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
      <div className="mb-4 flex flex-col gap-1">
        <Text size="small" leading="compact" weight="plus">
          {title}
        </Text>
        <Text
          size="small"
          leading="compact"
          className="text-ui-fg-subtle"
        >
          {description}
        </Text>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
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

export const config = defineRouteConfig({
  label: "Subscription Settings",
})

export default SubscriptionSettingsPage
