import { useEffect, useMemo, useState } from "react"
import { ClipboardCheck, Factory, FlaskConical, Loader2, X } from "lucide-react"

import api from "../api/api"
import SearchBar from "../components/SearchBar"
import PageHeader from "../components/PageHeader"

import { EmptyState, Notice } from "../components/feedback"

import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"

import { Card, CardDescription, CardHeader, CardTitle } from "../components/ui/card"

import { Input, Label } from "../components/ui/input"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table"

/*
=========================================================
HELPER FUNCTIONS
=========================================================
*/

const formatDate = (value) => {
  if (!value) {
    return "-"
  }

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

/*
---------------------------------------------------------
VALIDATE POSITIVE INTEGER
---------------------------------------------------------
*/

const isPositiveInteger = (value) => {
  const text = String(value ?? "").trim()

  if (!/^\d+$/.test(text)) {
    return false
  }

  const number = Number(text)

  return Number.isSafeInteger(number) && number > 0
}

/*
=========================================================
CHECK ROW COMPONENT
=========================================================
*/

function CheckRow({ title, description, value, onChange }) {
  return (
    <div className="rounded-xl border p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* CHECK DESCRIPTION */}

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium sm:text-base">{title}</p>

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{description}</p>
        </div>

        {/* PASS / FAIL */}

        <div className="flex flex-wrap items-center gap-4 sm:shrink-0">
          {/* PASS */}

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={value === "PASS"}
              onChange={() => onChange("PASS")}
              className="size-4 cursor-pointer accent-primary"
            />

            <span>PASS</span>
          </label>

          {/* FAIL */}

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={value === "FAIL"}
              onChange={() => onChange("FAIL")}
              className="size-4 cursor-pointer accent-destructive"
            />

            <span>FAIL</span>
          </label>
        </div>
      </div>
    </div>
  )
}

/*
=========================================================
OVERALL RESULT COMPONENT
=========================================================
*/

function OverallResult({ result, onPass, onFail }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium sm:text-base">Overall Result</p>

          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Select PASS or FAIL for the overall inspection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* PASS */}

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={result === "PASS"}
              onChange={onPass}
              className="size-4 cursor-pointer accent-primary"
            />
            PASS
          </label>

          {/* FAIL */}

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={result === "FAIL"}
              onChange={onFail}
              className="size-4 cursor-pointer accent-destructive"
            />
            FAIL
          </label>
        </div>
      </div>
    </div>
  )
}

/*
=========================================================
MAIN COMPONENT
=========================================================
*/

export default function QualityControl() {
  /*
  =======================================================
  PRODUCTION ORDERS
  =======================================================
  */

  const [productionOrders, setProductionOrders] = useState([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState("")

  const [search, setSearch] = useState("")

  /*
  =======================================================
  SELECTED PRODUCTION
  =======================================================
  */

  const [selectedProduction, setSelectedProduction] = useState(null)

  const [detail, setDetail] = useState(null)

  /*
  =======================================================
  LOADING / SAVING
  =======================================================
  */

  const [detailLoading, setDetailLoading] = useState(false)

  const [saving, setSaving] = useState(false)

  /*
  =======================================================
  ACTIVE STAGE
  =======================================================
  */

  const [activeStage, setActiveStage] = useState("TESTING")

  /*
  =======================================================
  TESTING FORM
  =======================================================
  */

  const [testingQuantity, setTestingQuantity] = useState("1")

  const [testingChecks, setTestingChecks] = useState({
    power: null,
    functional: null,
    display: null,
    communication: null,
  })

  const [testingResult, setTestingResult] = useState("")

  const [testingRemarks, setTestingRemarks] = useState("")

  /*
  =======================================================
  QC FORM
  =======================================================
  */

  const [qcQuantity, setQcQuantity] = useState("1")

  const [qcChecks, setQcChecks] = useState({
    appearance: null,
    assembly: null,
    labeling: null,
    dimensions: null,
    finalInspection: null,
  })

  const [qcResult, setQcResult] = useState("")

  const [qcRemarks, setQcRemarks] = useState("")

  /*
  =======================================================
  FETCH QC ORDERS
  =======================================================
  */

  const fetchQualityControlOrders = async () => {
    try {
      setLoading(true)

      const response = await api.get("/quality-control")

      setProductionOrders(Array.isArray(response.data) ? response.data : [])

      setError("")
    } catch (err) {
      console.error(err)

      setError(err.response?.data?.message || "Failed to load quality control orders.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQualityControlOrders()
  }, [])

  /*
  =======================================================
  PREVENT BACKGROUND SCROLL
  =======================================================
  */

  useEffect(() => {
    if (selectedProduction) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }

    return () => {
      document.body.style.overflow = ""
    }
  }, [selectedProduction])

  /*
  =======================================================
  RESET FORM
  =======================================================
  */

  const resetForm = () => {
    setTestingQuantity("1")

    setTestingChecks({
      power: null,
      functional: null,
      display: null,
      communication: null,
    })

    setTestingResult("")

    setTestingRemarks("")

    setQcQuantity("1")

    setQcChecks({
      appearance: null,
      assembly: null,
      labeling: null,
      dimensions: null,
      finalInspection: null,
    })

    setQcResult("")

    setQcRemarks("")

    setActiveStage("TESTING")

    setDetail(null)

    setError("")
  }

  /*
  =======================================================
  AVAILABLE ORDERS
  =======================================================
  */

  const availableOrders = useMemo(() => {
    return productionOrders.filter((production) => {
      return Number(production.quantityCompleted) > 0
    })
  }, [productionOrders])

  /*
  =======================================================
  SEARCH FILTER
  =======================================================
  */

  const filteredOrders = useMemo(() => {
    const searchText = search.toLowerCase().trim()

    return availableOrders.filter((production) => {
      if (!searchText) {
        return true
      }

      return (
        String(production.orderNumber || "")
          .toLowerCase()
          .includes(searchText) ||
        String(production.productName || "")
          .toLowerCase()
          .includes(searchText) ||
        String(production.productSku || "")
          .toLowerCase()
          .includes(searchText) ||
        String(production.status || "")
          .toLowerCase()
          .includes(searchText)
      )
    })
  }, [availableOrders, search])

  /*
  =======================================================
  OPEN QUALITY CONTROL MODAL
  =======================================================

  stage can be:

  TESTING
  QUALITY_CONTROL
  =======================================================
  */

  const openQualityControl = async (production, stage = "TESTING") => {
    /*
      ---------------------------------------------------
      SELECT ORDER
      ---------------------------------------------------
      */

    setSelectedProduction(production)

    /*
      ---------------------------------------------------
      RESET OLD FORM VALUES
      ---------------------------------------------------
      */

    resetForm()

    /*
      ---------------------------------------------------
      SET SELECTED ORDER AGAIN
      ---------------------------------------------------

      resetForm() does not clear
      selectedProduction, but keeping
      this explicit makes the intent clear.
      */

    setSelectedProduction(production)

    try {
      setDetailLoading(true)

      /*
        -------------------------------------------------
        LOAD CURRENT BACKEND DETAILS
        -------------------------------------------------
        */

      const response = await api.get(`/quality-control/${production.id}`)

      setDetail(response.data)

      /*
        -------------------------------------------------
        RESTORE LATEST TESTING RESULT
        -------------------------------------------------
        */

      if (response.data?.latestTesting?.overall_result) {
        setTestingResult(response.data.latestTesting.overall_result)
      }

      /*
        -------------------------------------------------
        RESTORE LATEST QC RESULT
        -------------------------------------------------
        */

      if (response.data?.latestQualityControl?.overall_result) {
        setQcResult(response.data.latestQualityControl.overall_result)
      }

      /*
        -------------------------------------------------
        OPEN EXACT STAGE CLICKED BY USER
        -------------------------------------------------
        */

      setActiveStage(stage)
    } catch (err) {
      console.error(err)

      setError(err.response?.data?.message || "Failed to load quality control details.")
    } finally {
      setDetailLoading(false)
    }
  }

  /*
  =======================================================
  CLOSE MODAL
  =======================================================
  */

  const closeQualityControl = () => {
    setSelectedProduction(null)

    resetForm()
  }

  /*
  =======================================================
  TESTING CHECK UPDATE
  =======================================================
  */

  const setTestingCheck = (key, value) => {
    setTestingChecks((previous) => {
      const next = {
        ...previous,
        [key]: value,
      }

      const values = Object.values(next)

      /*
          ------------------------------------------------
          ALL PASS
          ------------------------------------------------
          */

      if (values.every((item) => item === "PASS")) {
        setTestingResult("PASS")
      }

      /*
          ------------------------------------------------
          ANY FAIL
          ------------------------------------------------
          */

      if (values.some((item) => item === "FAIL")) {
        setTestingResult("FAIL")
      }

      return next
    })
  }

  /*
  =======================================================
  QC CHECK UPDATE
  =======================================================
  */

  const setQcCheck = (key, value) => {
    setQcChecks((previous) => {
      const next = {
        ...previous,
        [key]: value,
      }

      const values = Object.values(next)

      /*
          ------------------------------------------------
          ALL PASS
          ------------------------------------------------
          */

      if (values.every((item) => item === "PASS")) {
        setQcResult("PASS")
      }

      /*
          ------------------------------------------------
          ANY FAIL
          ------------------------------------------------
          */

      if (values.some((item) => item === "FAIL")) {
        setQcResult("FAIL")
      }

      return next
    })
  }

  /*
  =======================================================
  OVERALL TESTING PASS
  =======================================================
  */

  const handleOverallTestingPass = () => {
    setTestingChecks({
      power: "PASS",
      functional: "PASS",
      display: "PASS",
      communication: "PASS",
    })

    setTestingResult("PASS")
  }

  /*
  =======================================================
  OVERALL TESTING FAIL
  =======================================================
  */

  const handleOverallTestingFail = () => {
    setTestingResult("FAIL")
  }

  /*
  =======================================================
  OVERALL QC PASS
  =======================================================
  */

  const handleOverallQcPass = () => {
    setQcChecks({
      appearance: "PASS",
      assembly: "PASS",
      labeling: "PASS",
      dimensions: "PASS",
      finalInspection: "PASS",
    })

    setQcResult("PASS")
  }

  /*
  =======================================================
  OVERALL QC FAIL
  =======================================================
  */

  const handleOverallQcFail = () => {
    setQcResult("FAIL")
  }

  /*
  =======================================================
  TESTING MAX
  =======================================================
  */

  const testingSummary = detail?.testing || {}

  const testingMax = Number(testingSummary.remainingToTest ?? 0)

  /*
  =======================================================
  QC MAX
  =======================================================
  */

  const qcSummary = detail?.qualityControl || {}

  const qcMax = Number(qcSummary.availableForQC ?? 0)

  /*
  =======================================================
  CALCULATE BUTTON AVAILABILITY
  =======================================================
  */

  const getTestingAvailable = (production) => {
    const produced = Number(production.quantityCompleted || 0)

    const tested = Number(production.quantityTested || 0)

    return Math.max(produced - tested, 0)
  }

  const getQcAvailable = (production) => {
    const passed = Number(production.quantityPassed || 0)

    const inspected = Number(production.quantityInspected || 0)

    return Math.max(passed - inspected, 0)
  }

  /*
  =======================================================
  SAVE TESTING RESULT
  =======================================================
  */

  const handleSaveTesting = async () => {
    if (!selectedProduction) {
      return
    }

    setError("")

    /*
      ---------------------------------------------------
      VALIDATE QUANTITY
      ---------------------------------------------------
      */

    if (!isPositiveInteger(testingQuantity)) {
      setError("Testing quantity must be a positive integer.")

      return
    }

    const quantity = Number(testingQuantity)

    /*
      ---------------------------------------------------
      DO NOT EXCEED AVAILABLE
      ---------------------------------------------------
      */

    if (quantity > testingMax) {
      setError(`You can test at most ${testingMax} piece(s).`)

      return
    }

    /*
      ---------------------------------------------------
      CHECK ALL TESTING CHECKS
      ---------------------------------------------------
      */

    const testingChecksComplete = Object.values(testingChecks).every((value) => value !== null)

    if (!testingChecksComplete) {
      setError("Complete all testing checks before saving.")

      return
    }

    /*
      ---------------------------------------------------
      RESULT REQUIRED
      ---------------------------------------------------
      */

    if (testingResult !== "PASS" && testingResult !== "FAIL") {
      setError("Select an overall testing result.")

      return
    }

    try {
      setSaving(true)

      setError("")

      /*
        -------------------------------------------------
        SAVE TO BACKEND
        -------------------------------------------------
        */

      await api.post(`/quality-control/${selectedProduction.id}/testing`, {
        quantity,
        overallResult: testingResult,
        remarks: testingRemarks,
      })

      /*
        -------------------------------------------------
        REFRESH MAIN LIST
        -------------------------------------------------
        */

      await fetchQualityControlOrders()

      /*
        -------------------------------------------------
        REFRESH DETAILS
        -------------------------------------------------
        */

      const response = await api.get(`/quality-control/${selectedProduction.id}`)

      setDetail(response.data)

      /*
        -------------------------------------------------
        IF TESTING PASSED → QC
        -------------------------------------------------
        */

      if (testingResult === "PASS") {
        setActiveStage("QUALITY_CONTROL")

        setQcQuantity("1")

        setQcChecks({
          appearance: null,
          assembly: null,
          labeling: null,
          dimensions: null,
          finalInspection: null,
        })

        setQcResult("")

        setQcRemarks("")
      }
    } catch (err) {
      console.error(err)

      setError(err.response?.data?.message || "Failed to save testing result.")
    } finally {
      setSaving(false)
    }
  }

  /*
  =======================================================
  SAVE QC RESULT
  =======================================================
  */

  const handleSaveQc = async () => {
    if (!selectedProduction) {
      return
    }

    setError("")

    /*
      ---------------------------------------------------
      VALIDATE QUANTITY
      ---------------------------------------------------
      */

    if (!isPositiveInteger(qcQuantity)) {
      setError("QC quantity must be a positive integer.")

      return
    }

    const quantity = Number(qcQuantity)

    /*
      ---------------------------------------------------
      DO NOT EXCEED AVAILABLE QC QUANTITY
      ---------------------------------------------------
      */

    if (quantity > qcMax) {
      setError(`You can inspect at most ${qcMax} piece(s).`)

      return
    }

    /*
      ---------------------------------------------------
      CHECK ALL QC CHECKS
      ---------------------------------------------------
      */

    const qcChecksComplete = Object.values(qcChecks).every((value) => value !== null)

    if (!qcChecksComplete) {
      setError("Complete all quality control checks before saving.")

      return
    }

    /*
      ---------------------------------------------------
      VALIDATE RESULT
      ---------------------------------------------------
      */

    if (qcResult !== "PASS" && qcResult !== "FAIL" && qcResult !== "HOLD") {
      setError("Select an overall QC result.")

      return
    }

    try {
      setSaving(true)

      setError("")

      /*
        -------------------------------------------------
        SAVE QC TO BACKEND
        -------------------------------------------------
        */

      await api.post(`/quality-control/${selectedProduction.id}/qc`, {
        quantity,
        overallResult: qcResult,
        remarks: qcRemarks,
      })

      /*
        -------------------------------------------------
        REFRESH MAIN TABLE
        -------------------------------------------------
        */

      await fetchQualityControlOrders()

      /*
        -------------------------------------------------
        CLOSE POPUP AFTER SUCCESS
        -------------------------------------------------
        */

      closeQualityControl()
    } catch (err) {
      console.error(err)

      setError(err.response?.data?.message || "Failed to save QC result.")
    } finally {
      setSaving(false)
    }
  }

  /*
  =======================================================
  STATUS BADGE
  =======================================================
  */

  const getStatusBadge = (production) => {
    const approved = Number(production.quantityApproved || 0)

    const passed = Number(production.quantityPassed || 0)

    const inspected = Number(production.quantityInspected || 0)

    const tested = Number(production.quantityTested || 0)

    /*
      ---------------------------------------------------
      QC PASSED
      ---------------------------------------------------
      */

    if (approved > 0 && inspected > 0) {
      return <Badge>QC Passed</Badge>
    }

    /*
      ---------------------------------------------------
      QC COMPLETED
      ---------------------------------------------------
      */

    if (inspected > 0 && passed <= inspected) {
      return <Badge variant="secondary">QC Completed</Badge>
    }

    /*
      ---------------------------------------------------
      READY FOR QC
      ---------------------------------------------------
      */

    if (passed > inspected) {
      return <Badge>Ready for QC</Badge>
    }

    /*
      ---------------------------------------------------
      TESTING DONE
      ---------------------------------------------------
      */

    if (tested > 0) {
      return <Badge variant="secondary">Testing Done</Badge>
    }

    /*
      ---------------------------------------------------
      READY FOR TESTING
      ---------------------------------------------------
      */

    return <Badge variant="secondary">Ready for Testing</Badge>
  }

  /*
  =======================================================
  PAGE
  =======================================================
  */

  return (
    <>
      {/* =================================================
          PAGE HEADER
      ================================================= */}

      <PageHeader
        title="Quality Control"
        description="Test produced products and perform final quality inspection before packaging."
      />

      {/* =================================================
          GLOBAL ERROR
      ================================================= */}

      {error && (
        <div className="mb-4 sm:mb-6">
          <Notice title="Something went wrong">{error}</Notice>
        </div>
      )}

      {/* =================================================
          SUMMARY CARDS
      ================================================= */}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:mb-6 sm:gap-4 md:grid-cols-2">
        {/* PRODUCED */}

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted sm:size-10">
                <Factory className="size-5" />
              </div>

              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">Produced</CardTitle>

                <CardDescription className="text-xs sm:text-sm">
                  Orders with completed production
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <div className="px-4 pb-4 text-2xl font-bold sm:px-6 sm:pb-6 sm:text-3xl">
            {availableOrders.length}
          </div>
        </Card>

        {/* TOTAL PRODUCED QUANTITY */}

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted sm:size-10">
                <ClipboardCheck className="size-5" />
              </div>

              <div className="min-w-0">
                <CardTitle className="text-base sm:text-lg">Quality Control</CardTitle>

                <CardDescription className="text-xs sm:text-sm">Total produced quantity</CardDescription>
              </div>
            </div>
          </CardHeader>

          <div className="px-4 pb-4 text-2xl font-bold sm:px-6 sm:pb-6 sm:text-3xl">
            {availableOrders.reduce((total, order) => total + Number(order.quantityCompleted || 0), 0)}
          </div>
        </Card>
      </div>

      {/* =================================================
          SEARCH
      ================================================= */}

      <div className="mb-4 sm:mb-6">
        <SearchBar value={search} onChange={setSearch} placeholder="Search order, product, SKU..." />
      </div>

      {/* =================================================
          MAIN TABLE
      ================================================= */}

      <Card className="overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base sm:text-lg">Production Quality</CardTitle>

          <CardDescription className="text-xs sm:text-sm">
            Use Testing first, then Quality Control after testing has passed.
          </CardDescription>
        </CardHeader>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <EmptyState
              title="No production orders found"
              description="There are currently no completed production quantities ready for testing or quality control."
            />
          </div>
        ) : (
          /*
          -------------------------------------------------
          RESPONSIVE TABLE
          -------------------------------------------------
          */

          <div className="w-full overflow-x-auto px-2 pb-4 sm:px-6 sm:pb-6">
            <Table className="min-w-[1050px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>

                  <TableHead>Product</TableHead>

                  <TableHead>Produced</TableHead>

                  <TableHead>Testing</TableHead>

                  <TableHead>QC</TableHead>

                  <TableHead>Status</TableHead>

                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredOrders.map((production) => {
                  const testingAvailable = getTestingAvailable(production)

                  const qcAvailable = getQcAvailable(production)

                  return (
                    <TableRow key={production.id}>
                      {/* ORDER */}

                      <TableCell>
                        <div className="font-medium">{production.orderNumber || "-"}</div>
                      </TableCell>

                      {/* PRODUCT */}

                      <TableCell>
                        <div className="font-medium">{production.productName || "-"}</div>

                        <div className="text-xs text-muted-foreground">{production.productSku || "-"}</div>
                      </TableCell>

                      {/* PRODUCED */}

                      <TableCell>
                        <div className="font-medium">{production.quantityCompleted ?? 0}</div>
                      </TableCell>

                      {/* TESTING */}

                      <TableCell>
                        <div className="text-sm">
                          Tested: <span className="font-medium">{production.quantityTested ?? 0}</span>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Passed: {production.quantityPassed ?? 0}
                          {" / "}
                          Failed: {production.quantityFailed ?? 0}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          Remaining: {testingAvailable}
                        </div>
                      </TableCell>

                      {/* QC */}

                      <TableCell>
                        <div className="text-sm">
                          Inspected: <span className="font-medium">{production.quantityInspected ?? 0}</span>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Approved: {production.quantityApproved ?? 0}
                          {" / "}
                          Rejected: {production.quantityRejected ?? 0}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">Available: {qcAvailable}</div>
                      </TableCell>

                      {/* STATUS */}

                      <TableCell>{getStatusBadge(production)}</TableCell>

                      {/* ACTION BUTTONS */}

                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-2">
                          {/* =================================
                                TESTING BUTTON
                            ================================= */}

                          <Button
                            type="button"
                            variant="outline"
                            disabled={testingAvailable <= 0}
                            onClick={() => openQualityControl(production, "TESTING")}
                          >
                            Testing
                          </Button>

                          {/* =================================
                                QUALITY CONTROL BUTTON
                            ================================= */}

                          <Button
                            type="button"
                            disabled={qcAvailable <= 0}
                            onClick={() => openQualityControl(production, "QUALITY_CONTROL")}
                          >
                            Quality Control
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* =================================================
          MODAL
      ================================================= */}

      {selectedProduction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-3 md:p-4">
          <div className="flex h-full max-h-screen w-full flex-col overflow-hidden rounded-none bg-background shadow-2xl sm:h-auto sm:max-h-[94vh] sm:max-w-5xl sm:rounded-2xl">
            {/* =================================================
                MODAL HEADER
            ================================================= */}

            <div className="shrink-0 border-b px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground sm:text-sm">
                    Production Quality
                  </p>

                  <h2 className="mt-1 text-xl font-bold leading-tight sm:text-2xl">
                    Testing & Quality Control
                  </h2>

                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    Complete testing first, then perform final quality inspection.
                  </p>
                </div>

                {/* MOBILE CLOSE */}

                <button
                  type="button"
                  onClick={closeQualityControl}
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border hover:bg-muted sm:hidden"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>

                {/* DESKTOP CLOSE */}

                <Button variant="outline" onClick={closeQualityControl} className="hidden shrink-0 sm:flex">
                  Close
                </Button>
              </div>

              {/* ORDER INFORMATION */}

              <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl border bg-muted/30 p-3 sm:mt-5 sm:grid-cols-3 sm:gap-3 sm:p-4">
                {/* ORDER */}

                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Order</p>

                  <p className="mt-1 truncate text-sm font-medium sm:text-base">
                    {selectedProduction.orderNumber || "-"}
                  </p>
                </div>

                {/* PRODUCT */}

                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Product</p>

                  <p className="mt-1 truncate text-sm font-medium sm:text-base">
                    {selectedProduction.productName || "-"}
                  </p>
                </div>

                {/* PRODUCED */}

                <div>
                  <p className="text-xs text-muted-foreground">Produced</p>

                  <p className="mt-1 text-sm font-medium sm:text-base">
                    {selectedProduction.quantityCompleted ?? 0}
                  </p>
                </div>
              </div>
            </div>

            {/* =================================================
                MODAL CONTENT
            ================================================= */}

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              {detailLoading ? (
                <div className="flex min-h-64 items-center justify-center">
                  <Loader2 className="size-7 animate-spin" />
                </div>
              ) : (
                <>
                  {/* =================================================
                      STAGE BUTTONS
                  ================================================= */}

                  <div className="mb-5 grid grid-cols-1 gap-2 sm:mb-6 sm:grid-cols-2 sm:gap-3">
                    {/* TESTING */}

                    <Button
                      type="button"
                      variant={activeStage === "TESTING" ? "default" : "outline"}
                      onClick={() => setActiveStage("TESTING")}
                      className="h-12 w-full justify-center gap-2 text-sm sm:h-14 sm:text-base"
                    >
                      <FlaskConical className="size-5" />
                      Testing
                    </Button>

                    {/* QUALITY CONTROL */}

                    <Button
                      type="button"
                      variant={activeStage === "QUALITY_CONTROL" ? "default" : "outline"}
                      onClick={() => setActiveStage("QUALITY_CONTROL")}
                      className="h-12 w-full justify-center gap-2 text-sm sm:h-14 sm:text-base"
                    >
                      <ClipboardCheck className="size-5" />
                      Quality Control
                    </Button>
                  </div>

                  {/* =================================================
                      TESTING STAGE
                  ================================================= */}

                  {activeStage === "TESTING" && (
                    <div className="space-y-5 sm:space-y-6">
                      {/* QUANTITY TO TEST */}

                      <div className="rounded-xl border p-3 sm:p-5">
                        <div className="mb-3">
                          <Label htmlFor="testingQuantity" className="text-sm sm:text-base">
                            Quantity to Test
                          </Label>

                          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                            Maximum available for testing: <span className="font-medium">{testingMax}</span>
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:flex sm:max-w-md">
                          <Input
                            id="testingQuantity"
                            type="text"
                            inputMode="numeric"
                            value={testingQuantity}
                            onChange={(event) => setTestingQuantity(event.target.value)}
                            placeholder="Enter quantity"
                            className="w-full sm:max-w-xs"
                          />

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setTestingQuantity(String(testingMax))}
                            disabled={testingMax <= 0}
                            className="w-full sm:w-auto"
                          >
                            Max
                          </Button>
                        </div>
                      </div>

                      {/* TESTING CHECKS */}

                      <div>
                        <div className="mb-3 sm:mb-4">
                          <h3 className="text-base font-semibold sm:text-lg">Testing Checks</h3>

                          <p className="text-xs text-muted-foreground sm:text-sm">
                            Check each functional test.
                          </p>
                        </div>

                        <div className="space-y-2 sm:space-y-3">
                          <CheckRow
                            title="Power"
                            description="Product powers on correctly."
                            value={testingChecks.power}
                            onChange={(value) => setTestingCheck("power", value)}
                          />

                          <CheckRow
                            title="Functional"
                            description="Main product functions work correctly."
                            value={testingChecks.functional}
                            onChange={(value) => setTestingCheck("functional", value)}
                          />

                          <CheckRow
                            title="Display"
                            description="Display, indicators, or UI operate correctly."
                            value={testingChecks.display}
                            onChange={(value) => setTestingCheck("display", value)}
                          />

                          <CheckRow
                            title="Communication"
                            description="Communication interface works correctly."
                            value={testingChecks.communication}
                            onChange={(value) => setTestingCheck("communication", value)}
                          />
                        </div>
                      </div>

                      {/* OVERALL RESULT */}

                      <OverallResult
                        result={testingResult}
                        onPass={handleOverallTestingPass}
                        onFail={handleOverallTestingFail}
                      />

                      {/* TESTING REMARKS */}

                      <div>
                        <Label htmlFor="testingRemarks" className="text-sm sm:text-base">
                          Testing Remarks
                        </Label>

                        <textarea
                          id="testingRemarks"
                          value={testingRemarks}
                          onChange={(event) => setTestingRemarks(event.target.value)}
                          placeholder="Add testing observations..."
                          className="mt-2 min-h-24 w-full rounded-xl border bg-background px-3 py-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-28 sm:px-4"
                        />
                      </div>

                      {/* SAVE TESTING */}

                      <div className="flex justify-stretch sm:justify-end">
                        <Button onClick={handleSaveTesting} disabled={saving} className="w-full sm:w-auto">
                          {saving ? (
                            <>
                              <Loader2 className="mr-2 size-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save Testing Result"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* =================================================
                      QUALITY CONTROL STAGE
                  ================================================= */}

                  {activeStage === "QUALITY_CONTROL" && (
                    <div className="space-y-5 sm:space-y-6">
                      {/* QUANTITY TO INSPECT */}

                      <div className="rounded-xl border p-3 sm:p-5">
                        <div className="mb-3">
                          <Label htmlFor="qcQuantity" className="text-sm sm:text-base">
                            Quantity to Inspect
                          </Label>

                          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                            Maximum available for QC: <span className="font-medium">{qcMax}</span>
                          </p>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:flex sm:max-w-md">
                          <Input
                            id="qcQuantity"
                            type="text"
                            inputMode="numeric"
                            value={qcQuantity}
                            onChange={(event) => setQcQuantity(event.target.value)}
                            placeholder="Enter quantity"
                            className="w-full sm:max-w-xs"
                          />

                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setQcQuantity(String(qcMax))}
                            disabled={qcMax <= 0}
                            className="w-full sm:w-auto"
                          >
                            Max
                          </Button>
                        </div>
                      </div>

                      {/* QC CHECKS */}

                      <div>
                        <div className="mb-3 sm:mb-4">
                          <h3 className="text-base font-semibold sm:text-lg">Quality Control Checks</h3>

                          <p className="text-xs text-muted-foreground sm:text-sm">
                            Perform the final inspection.
                          </p>
                        </div>

                        <div className="space-y-2 sm:space-y-3">
                          <CheckRow
                            title="Appearance"
                            description="Product appearance is acceptable."
                            value={qcChecks.appearance}
                            onChange={(value) => setQcCheck("appearance", value)}
                          />

                          <CheckRow
                            title="Assembly"
                            description="All components are assembled correctly."
                            value={qcChecks.assembly}
                            onChange={(value) => setQcCheck("assembly", value)}
                          />

                          <CheckRow
                            title="Labeling"
                            description="Labels and product markings are correct."
                            value={qcChecks.labeling}
                            onChange={(value) => setQcCheck("labeling", value)}
                          />

                          <CheckRow
                            title="Dimensions"
                            description="Product dimensions meet requirements."
                            value={qcChecks.dimensions}
                            onChange={(value) => setQcCheck("dimensions", value)}
                          />

                          <CheckRow
                            title="Final Inspection"
                            description="Final inspection confirms product acceptability."
                            value={qcChecks.finalInspection}
                            onChange={(value) => setQcCheck("finalInspection", value)}
                          />
                        </div>
                      </div>

                      {/* OVERALL QC RESULT */}

                      <OverallResult
                        result={qcResult}
                        onPass={handleOverallQcPass}
                        onFail={handleOverallQcFail}
                      />

                      {/* QC HOLD */}

                      <div className="rounded-xl border p-3 sm:p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-medium sm:text-base">QC Hold</p>

                            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                              Use HOLD when the product needs further review.
                            </p>
                          </div>

                          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                            <input
                              type="checkbox"
                              checked={qcResult === "HOLD"}
                              onChange={() => setQcResult("HOLD")}
                              className="size-4 cursor-pointer"
                            />
                            HOLD
                          </label>
                        </div>
                      </div>

                      {/* SUCCESS MESSAGE */}

                      {qcResult === "PASS" && (
                        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-green-800 sm:p-4">
                          <p className="text-sm font-semibold sm:text-base">All quality checks passed</p>

                          <p className="mt-1 text-xs sm:text-sm">The product can move to packaging.</p>
                        </div>
                      )}

                      {/* QC REMARKS */}

                      <div>
                        <Label htmlFor="qcRemarks" className="text-sm sm:text-base">
                          QC Remarks
                        </Label>

                        <textarea
                          id="qcRemarks"
                          value={qcRemarks}
                          onChange={(event) => setQcRemarks(event.target.value)}
                          placeholder="Add inspection observations..."
                          className="mt-2 min-h-24 w-full rounded-xl border bg-background px-3 py-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-h-28 sm:px-4"
                        />
                      </div>

                      {/* FOOTER */}

                      <div className="grid grid-cols-1 gap-2 border-t pt-4 sm:flex sm:justify-end sm:gap-3 sm:pt-5">
                        {/* BACK TO TESTING */}

                        <Button
                          variant="outline"
                          onClick={() => setActiveStage("TESTING")}
                          disabled={saving}
                          className="w-full sm:w-auto"
                        >
                          Back to Testing
                        </Button>

                        {/* SAVE QC */}

                        <Button onClick={handleSaveQc} disabled={saving} className="w-full sm:w-auto">
                          {saving ? (
                            <>
                              <Loader2 className="mr-2 size-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save QC Result"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
