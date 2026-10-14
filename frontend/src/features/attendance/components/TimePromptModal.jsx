import { Modal } from "@/components/Modal"
import { longDate } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { Field, TextInput } from "@/components/FormField"

export default function TimePromptModal({
  date,
  setTimeAsk,
  setTimeValue,
  submitTime,
  timeAsk,
  timeBusy,
  timeValue,
}) {
  return (
    <Modal
      open={!!timeAsk}
      onClose={() => { if (!timeBusy) setTimeAsk(null) }}
      busy={timeBusy}
      size="sm"
      title={timeAsk?.action === "check-out" ? "Set check-out time" : "Set check-in time"}
      description={timeAsk ? `${timeAsk.employee.name} · ${longDate(date)}` : ""}
      onSubmit={submitTime}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" disabled={timeBusy} onClick={() => setTimeAsk(null)}>Cancel</Button>
          <Button type="submit" size="lg" disabled={timeBusy || !timeValue}>
            {timeBusy && <Loader2 className="animate-spin" />}
            {timeAsk?.action === "check-out" ? "Check Out" : "Check In"}
          </Button>
        </>
      }
    >
      <Field label={timeAsk?.action === "check-out" ? "Check-out time" : "Check-in time"} htmlFor="att-time" hint="This is a past date, so enter the actual time instead of using the current time.">
        <TextInput id="att-time" type="time" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} required />
      </Field>
    </Modal>
  )
}
