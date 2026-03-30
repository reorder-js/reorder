import { moduleIntegrationTestRunner } from "@medusajs/test-utils"
import { RENEWAL_MODULE } from ".."
import RenewalAttempt from "../models/renewal-attempt"
import RenewalCycle from "../models/renewal-cycle"
import RenewalModuleService from "../service"
import {
  RenewalAttemptStatus,
  RenewalApprovalStatus,
  RenewalCycleStatus,
} from "../types"

moduleIntegrationTestRunner<RenewalModuleService>({
  moduleName: RENEWAL_MODULE,
  moduleModels: [RenewalCycle, RenewalAttempt],
  resolve: "./src/modules/renewal",
  testSuite: ({ service }) => {
    describe("RenewalModuleService", () => {
      it("creates and retrieves a renewal cycle", async () => {
        const created = await service.createRenewalCycles({
          subscription_id: "sub_module_001",
          scheduled_for: new Date("2026-03-30T10:00:00.000Z"),
          processed_at: null,
          status: RenewalCycleStatus.SCHEDULED,
          approval_required: true,
          approval_status: RenewalApprovalStatus.PENDING,
          approval_decided_at: null,
          approval_decided_by: null,
          approval_reason: null,
          generated_order_id: null,
          applied_pending_update_data: null,
          last_error: null,
          attempt_count: 0,
          metadata: {
            source: "module-test",
          },
        } as any)

        const retrieved = await service.retrieveRenewalCycle(created.id)

        expect(retrieved.id).toEqual(created.id)
        expect(retrieved.subscription_id).toEqual("sub_module_001")
        expect(retrieved.status).toEqual(RenewalCycleStatus.SCHEDULED)
        expect(retrieved.approval_status).toEqual(RenewalApprovalStatus.PENDING)
      })

      it("creates an attempt and updates renewal processing state", async () => {
        const cycle = await service.createRenewalCycles({
          subscription_id: "sub_module_002",
          scheduled_for: new Date("2026-03-30T11:00:00.000Z"),
          processed_at: null,
          status: RenewalCycleStatus.SCHEDULED,
          approval_required: false,
          approval_status: null,
          approval_decided_at: null,
          approval_decided_by: null,
          approval_reason: null,
          generated_order_id: null,
          applied_pending_update_data: null,
          last_error: null,
          attempt_count: 0,
          metadata: null,
        } as any)

        const attempt = await service.createRenewalAttempts({
          renewal_cycle_id: cycle.id,
          attempt_no: 1,
          started_at: new Date("2026-03-30T11:01:00.000Z"),
          finished_at: null,
          status: RenewalAttemptStatus.PROCESSING,
          error_code: null,
          error_message: null,
          payment_reference: null,
          order_id: null,
          metadata: {
            trigger_type: "scheduler",
          },
        } as any)

        await service.updateRenewalCycles({
          id: cycle.id,
          status: RenewalCycleStatus.PROCESSING,
          attempt_count: 1,
        } as any)

        const updatedCycle = await service.retrieveRenewalCycle(cycle.id)
        const retrievedAttempt = await service.retrieveRenewalAttempt(attempt.id)

        expect(updatedCycle.status).toEqual(RenewalCycleStatus.PROCESSING)
        expect(updatedCycle.attempt_count).toEqual(1)
        expect(retrievedAttempt.renewal_cycle_id).toEqual(cycle.id)
        expect(retrievedAttempt.status).toEqual(RenewalAttemptStatus.PROCESSING)
      })
    })
  },
})

jest.setTimeout(60 * 1000)
