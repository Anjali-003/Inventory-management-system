import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { CfButton, Pill } from "@/components/HistoryUI";
import { cn } from "@/lib/utils";
import { fmtQty } from "@/lib/stock";
import { TEXT, balanceStatus, BG } from "./balance/balanceTheme";
import { Step } from "./balance/Step";
import { GapChart3D } from "./balance/GapChart3D";

const BAR = {
  danger: "bg-destructive",
  info: "bg-primary",
  warning: "bg-warning",
  neutral: "bg-muted-foreground/45",
};

export default function BalanceSheetCard({ balance, onSeeShortfall }) {
  const diff = Number(balance.difference);
  const st = balanceStatus(diff);
  const isShort = diff < 0;
  const isOver = diff > 0;
  const amount = fmtQty(Math.abs(diff));
  const should = fmtQty(balance.expected_remaining);
  const actual = fmtQty(balance.actual_on_hand);

  const headline = isShort
    ? `${amount} components are missing`
    : isOver
      ? `${amount} extra components in stock`
      : "Everything matches";
  const sentence = isShort
    ? `The records say ${should} should be in stock, but only ${actual} are.`
    : isOver
      ? `The records say ${should} should be in stock, but ${actual} are.`
      : `All ${should} components that should be in stock are there.`;

  const expected = Math.max(Number(balance.expected_remaining) || 0, 0);
  const actualN = Math.max(Number(balance.actual_on_hand) || 0, 0);

  return (
    <div className="grid lg:grid-cols-5">
      <div
        className={cn(
          "order-first flex flex-col items-start justify-center gap-3.5 border-b px-5 py-6 lg:order-last lg:col-span-2 lg:border-b-0 lg:border-l lg:px-6",
          BG[st.tone],
        )}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className="mb-1.5">
            <Pill tone={st.tone} dot pulse={isShort}>
              {st.pill}
            </Pill>
          </div>
          <p
            className={cn(
              "text-sm font-bold leading-snug tracking-[-0.15px]",
              TEXT[st.tone],
            )}
          >
            {headline}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            {sentence}
          </p>
        </motion.div>
        <GapChart3D expected={expected} actual={actualN} />
        {isShort && onSeeShortfall && (
          <CfButton variant="ghost" className="group" onClick={onSeeShortfall}>
            See where they went{" "}
            <ChevronRight className="transition-transform group-hover:translate-x-0.5" />
          </CfButton>
        )}
      </div>

      <motion.ol
        initial="hidden"
        animate="show"
        variants={{
          show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
        }}
        className="divide-y lg:col-span-3"
      >
        <Step
          n={1}
          label="Received so far"
          caption="Everything that has come in since the start"
          amount={Number(balance.received_total)}
        />
        <Step
          n={2}
          label="Used in finished products"
          caption="Components that went into products that passed quality control"
          amount={Number(balance.components_used)}
          op="−"
        />
        <Step
          n={3}
          label="Should be in stock"
          formula="1 − 2"
          caption="What the records say is left"
          amount={Number(balance.expected_remaining)}
          strong
        />
        <Step
          n={4}
          label="Actually in stock"
          caption="What the inventory shows right now"
          amount={Number(balance.actual_on_hand)}
        />
        <Step
          n={5}
          label={isShort ? "Missing" : isOver ? "Extra" : "Difference"}
          formula={isOver ? "4 − 3" : "3 − 4"}
          caption={
            isShort
              ? "Should be in stock, but not found"
              : isOver
                ? "Found, but not in the records"
                : "Nothing missing, nothing extra"
          }
          amount={Math.abs(diff)}
          tone={st.tone}
          strong
        />
      </motion.ol>
    </div>
  );
}

