# Custom Workflows

A workflow is a series of queries and actions that complete a task.

The workflow is created in a TypeScript or JavaScript file under the `src/workflows` directory.

For example:

```ts
import {
  createStep,
  createWorkflow,
  WorkflowResponse,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"

const step1 = createStep("step-1", async () => {
  return new StepResponse(`Hello from step one!`)
})

type WorkflowInput = {
  name: string
}

const step2 = createStep(
  "step-2",
  async ({ name }: WorkflowInput) => {
    return new StepResponse(`Hello ${name} from step two!`)
  }
)

type WorkflowOutput = {
  message1: string
  message2: string
}

const helloWorldWorkflow = createWorkflow(
  "hello-world",
  (input: WorkflowInput) => {
    const greeting1 = step1()
    const greeting2 = step2(input)
    
    return new WorkflowResponse({
      message1: greeting1,
      message2: greeting2
    })
  }
)

export default helloWorldWorkflow
```

## Execute Workflow

You can execute the workflow from other resources, such as API routes, scheduled jobs, or subscribers.

For example, to execute the workflow in an API route:

```ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework"
import myWorkflow from "../../../workflows/hello-world"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  const { result } = await myWorkflow(req.scope)
    .run({
      input: {
        name: req.query.name as string,
      },
    })

  res.send(result)
}
```

## Extensibility Hooks

### `processRenewalCycleWorkflow` — `setPaymentSessionData`

`processRenewalCycleWorkflow` exposes a `setPaymentSessionData` hook that lets you control the
`data` passed to the payment session created for a renewal's payment collection. Register a
handler the same way you would consume any Medusa workflow hook:

```ts
import { processRenewalCycleWorkflow } from "@bethinkpl/reorder/workflows"
import { StepResponse } from "@medusajs/framework/workflows-sdk"

processRenewalCycleWorkflow.hooks.setPaymentSessionData(
  ({ payment_collections, subscription, order }) => {
    return new StepResponse({
      payment_method: subscription.payment_context?.payment_method_id,
      off_session: true,
      confirm: true,
      capture_method: "automatic",
      metadata: { renewal_order_id: order?.id },
    })
  }
)
```

- The handler receives the created `payment_collections`, the `subscription`, and the renewal
  `order`. It runs once per renewal cycle.
- The result is validated with zod and must be a record of string keys to arbitrary values
  (`Record<string, unknown>`). Return `undefined` to keep the built-in default payment session
  data (`payment_method`, `off_session`, `confirm`, `capture_method`).
- When a handler returns a value it **completely replaces** the default `data` — there is no
  merge, so include every field your payment provider needs.
- When the renewal is skipped or the order total is `0`, no payment session is created;
  `payment_collections` and `order` are `null` and the handler result is ignored.
