import { TableSkeleton, EmptyState } from "@/components/feedback";
import { Factory } from "lucide-react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { n } from "../qcUtils";
import { Status } from "./QcStatus";
import { Button } from "@/components/saturday/button";
import { ProductionCard } from "./ProductionCard";
import UserCell from "@/components/UserCell";

export default function QcQueue({
  loading,
  open,
  query,
  rows,
}) {
  return (
    loading ? (
      <TableSkeleton rows={7} />
    ) : rows.length === 0 ? (
      <EmptyState
        icon={Factory}
        title={
          query
            ? "No matching production runs"
            : "Nothing ready for inspection"
        }
      >
        Completed production quantities will appear here.
      </EmptyState>
    ) : (
      <>
        <div className="hidden w-full overflow-hidden md:block">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[16%]">Order</TableHead>
                <TableHead className="w-[15%]">Product</TableHead>
                <TableHead className="w-[8%]">Produced</TableHead>
                <TableHead className="w-[18%]">Testing</TableHead>
                <TableHead className="w-[18%]">QC</TableHead>
                <TableHead className="w-[10%]">Status</TableHead>
                <TableHead className="w-[15%] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const testing = n(item.remainingToTest);
                const failed = n(item.quantityFailed);
                const qc = n(item.availableForQC);
                const rejected = n(item.quantityRejected);
                const readyForFinishedGoods = !!item.readyForFinishedGoods;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium tabular-nums">
                      {item.orderNumber}
                    </TableCell>
                    <TableCell>
                      <span className="block font-medium">
                        {item.productName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.productSku}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {n(item.quantityCompleted)}
                    </TableCell>
                    <TableCell>
                      <p>Tested {n(item.quantityTested)}</p>
                      <p className="text-xs text-muted-foreground">
                        Passed {n(item.quantityPassed)} · Failed {failed} ·
                        Left {testing}
                      </p>
                      {item.lastTestedBy && (
                        <UserCell className="mt-1.5" name={item.lastTestedBy} sub="Last tested by" />
                      )}
                    </TableCell>
                    <TableCell>
                      <p>Inspected {n(item.quantityInspected)}</p>
                      <p className="text-xs text-muted-foreground">
                        Approved {n(item.quantityApproved)} · Ready {qc}
                      </p>
                      {item.lastCheckedBy && (
                        <UserCell className="mt-1.5" name={item.lastCheckedBy} sub="Last checked by" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Status item={item} />
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <div className="flex flex-wrap justify-end gap-2">
                        {(testing > 0 || failed > 0) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => open(item, "TESTING")}
                          >
                            Testing
                          </Button>
                        )}
                        {failed > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => open(item, "REDO_TESTING")}
                          >
                            Edit Testing
                          </Button>
                        )}
                        {testing <= 0 && failed === 0 && qc > 0 && (
                          <Button
                            size="sm"
                            onClick={() => open(item, "QUALITY_CONTROL")}
                          >
                            Quality Control
                          </Button>
                        )}
                        {testing <= 0 && failed === 0 && rejected > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => open(item, "REDO_QC")}
                          >
                            Edit QC
                          </Button>
                        )}
                        {readyForFinishedGoods && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              (window.location.href = "/finished-goods")
                            }
                          >
                            Open Finished Goods
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 p-3 md:hidden">
          {rows.map((item) => (
            <ProductionCard key={item.id} item={item} onOpen={open} />
          ))}
        </div>
      </>
    )
  );
}
