"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { analyzeMessage, validateMessageBody } from "@/server/domain/segments";
import { normalizePhone, splitPastedNumbers } from "@/server/domain/phone";
import {
  confirmSendAction,
  createQuoteAction,
  type QuoteView,
} from "@/server/actions/campaigns";
import {
  Button,
  Card,
  DetailRow,
  Field,
  Input,
  Notice,
  Pill,
  Select,
  Textarea,
  cx,
} from "@/components/ui";
import { TestSendPanel } from "./test-send-panel";
import type { TestRecipient } from "@/server/domain/test-send";
import { loadGroupRecipientsAction } from "@/server/actions/groups";
import { useT } from "@/i18n/client";
import type { Dictionary } from "@/i18n/dictionaries";
import {
  IconArrowRight,
  IconCalculator,
  IconCheck,
  IconDocument,
  IconFile,
  IconInfo,
  IconX,
} from "@/components/icons";

type Sender = { id: string; value: string; supportsInboundReplies: boolean };
type Template = { id: string; name: string; body: string };

type Limits = {
  ceiling: number;
  maxSegments: number;
  maxScheduleDays: number;
  unitPriceCentavos: number;
  dailyRemaining: number;
  availableCentavos: number;
};

function stepsFor(t: Dictionary): string[] {
  return [t.send.stepRecipients, t.send.stepMessage, t.send.stepReview];
}

const peso = (centavos: number) =>
  `₱${Math.floor(centavos / 100).toLocaleString("en-PH")}.${String(centavos % 100).padStart(2, "0")}`;

/**
 * Send wizard.
 *
 * Everything shown here is an estimate for the customer's benefit. The server
 * recomputes normalization, exclusions, segmentation and price when the quote
 * is issued, and the quote is what a send is bound to — these numbers never
 * authorize a charge on their own.
 */
export function SendWizard({
  senders,
  templates,
  limits,
  testRecipients,
  groups,
  initialGroupId,
}: {
  senders: Sender[];
  templates: Template[];
  limits: Limits;
  testRecipients: TestRecipient[];
  groups: Array<{ id: string; name: string; memberCount: number }>;
  initialGroupId?: string;
}) {
  const t = useT();

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"manual" | "csv" | "group">(
    initialGroupId ? "group" : "manual",
  );
  const [groupId, setGroupId] = useState(initialGroupId ?? "");
  const [groupRows, setGroupRows] = useState<string[]>([]);
  const [groupLabel, setGroupLabel] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupLoading, setGroupLoading] = useState(false);
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileRows, setFileRows] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [senderId, setSenderId] = useState(senders[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [timing, setTiming] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /**
   * Generated once per review and reused for every confirm attempt, so a
   * double-click or a retry after a dropped response lands on the same campaign
   * instead of sending twice.
   */
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const rawEntries =
    mode === "manual"
      ? splitPastedNumbers(pasted)
      : mode === "csv"
        ? fileRows
        : groupRows;

  /** Client-side preview of the same rules the server enforces. */
  const recipients = useMemo(() => {
    const seen = new Set<string>();
    let invalid = 0;
    let duplicate = 0;
    for (const entry of rawEntries) {
      const result = normalizePhone(entry);
      if (!result.ok) {
        invalid += 1;
        continue;
      }
      if (seen.has(result.normalized)) {
        duplicate += 1;
        continue;
      }
      seen.add(result.normalized);
    }
    return { unique: [...seen], invalid, duplicate, raw: rawEntries.length };
  }, [rawEntries]);

  const info = analyzeMessage(body);
  const sender = senders.find((s) => s.id === senderId);
  const bodyCheck = validateMessageBody(body || " ", {
    maxSegments: limits.maxSegments,
    supportsNonBmp: true,
    supportsUnicode: true,
  });

  const includedCount = Math.min(recipients.unique.length, limits.ceiling);
  const overCeiling = Math.max(recipients.unique.length - limits.ceiling, 0);
  const estimatedCost = includedCount * info.segments * limits.unitPriceCentavos;

  const recipientsReady = includedCount > 0;
  const messageReady = body.trim().length > 0 && bodyCheck.ok && Boolean(senderId);

  /** Asks the server to price the send. The result, not the preview, is binding. */
  function loadGroup(nextGroupId: string) {
    setGroupId(nextGroupId);
    setGroupError(null);
    setGroupLabel(null);
    setGroupRows([]);
    if (!nextGroupId) return;

    setGroupLoading(true);
    void loadGroupRecipientsAction(nextGroupId)
      .then((outcome) => {
        if (outcome.ok) {
          setGroupRows(outcome.numbers);
          setGroupLabel(outcome.name);
        } else {
          setGroupError(outcome.message);
        }
      })
      .finally(() => setGroupLoading(false));
  }

  function requestQuote() {
    setError(null);
    startTransition(async () => {
      const result = await createQuoteAction({
        senderIdentityId: senderId,
        body,
        recipients: rawEntries,
        scheduledAt: timing === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      });
      if (!result.ok) {
        setError({ message: result.error, code: result.code });
        return;
      }
      setQuote(result.quote);
      setIdempotencyKey(crypto.randomUUID());
      setStep(2);
    });
  }

  function confirmSend() {
    if (!quote) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmSendAction({
        quoteId: quote.quoteId,
        name: campaignName.trim() || defaultCampaignName(),
        idempotencyKey,
      });
      if (!result.ok) {
        setError({ message: result.error, code: result.code });
        // A stale or spent quote has to be re-priced before trying again.
        if (result.code === "QUOTE_INVALID") setQuote(null);
        return;
      }
      router.push(`/app/campaigns/${result.campaignId}`);
    });
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) {
      setFileError("That file is empty.");
      return;
    }
    // Client-side preview only. The server re-parses the upload with a real CSV
    // parser and is the authority on which rows are eligible.
    const header = lines[0]!.toLowerCase();
    const hasHeader = header.includes("phone_number");
    if (!hasHeader) {
      setFileError("The file needs a phone_number column.");
      return;
    }
    const index = header.split(",").findIndex((h) => h.trim() === "phone_number");
    const values = lines.slice(1).map((line) => (line.split(",")[index] ?? "").trim());
    setFileName(file.name);
    setFileRows(values);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
      <div className="xl:col-span-2">
        <Stepper step={step} labels={stepsFor(t)} />
      </div>

      <div className="min-w-0 space-y-5">
        {step === 0 ? (
          <Card className="p-5">
            <h2 className="text-[17px] font-bold text-ink">{t.send.recipientsHeading}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {t.send.recipientsSubheading}
            </p>

            {/* role="tab" requires a tablist parent; without it the grouping is
                not conveyed and axe flags it as a critical failure. */}
            <div
              role="tablist"
              aria-label={t.send.tablistLabel}
              className="mt-4 flex gap-1 border-b border-line"
            >
              <Tab active={mode === "manual"} onClick={() => setMode("manual")}>
                {t.send.tabManual}
              </Tab>
              <Tab active={mode === "csv"} onClick={() => setMode("csv")}>
                {t.send.tabCsv}
              </Tab>
              <Tab active={mode === "group"} onClick={() => setMode("group")}>
                {t.send.tabGroup}
              </Tab>
            </div>

            {mode === "manual" ? (
              <div className="mt-4">
                <Field
                  label={t.send.numbersLabel}
                  htmlFor="numbers"
                  hint={t.send.numbersHint}
                >
                  <Textarea
                    id="numbers"
                    rows={6}
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder={"09171234567\n09181234567"}
                  />
                </Field>
              </div>
            ) : (
              <div className="mt-4">
                <label
                  htmlFor="csv"
                  className="block cursor-pointer rounded-[10px] border border-dashed border-brand-200 bg-brand-50/40 px-4 py-10 text-center"
                >
                  <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center text-muted">
                    <IconFile size={26} />
                  </span>
                  <span className="block text-[13.5px] text-body">{t.send.dropCsv}</span>
                  <span className="mt-1 block text-[13px] text-muted">{t.send.or}</span>
                  <span className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-[13px] font-semibold text-white">
                    {t.send.browseFiles}
                  </span>
                  <input
                    id="csv"
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </label>

                <Link
                  href="/app/contacts/template.csv"
                  className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-brand-600 hover:underline"
                >
                  <IconDocument size={15} /> {t.send.downloadTemplate}
                  <span className="font-normal text-muted">
                    {t.send.templateHint}
                  </span>
                </Link>

                {fileError ? (
                  <div className="mt-3">
                    <Notice tone="danger" title={t.send.fileUnreadable}>
                      {fileError}
                    </Notice>
                  </div>
                ) : null}

                {fileName ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[9px] border border-line px-3 py-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-bg text-neutral-fg">
                      <IconDocument size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {fileName}
                      </span>
                      <span className="block text-[12px] text-muted">
                        {t.send.rowsReadPreview(recipients.raw)}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <Pill tone="success" dot={false}>
                        <IconCheck size={12} /> {t.send.validCount(includedCount)}
                      </Pill>
                      {recipients.duplicate > 0 ? (
                        <Pill tone="neutral" dot={false}>
                          {t.send.duplicatesRemoved(recipients.duplicate)}
                        </Pill>
                      ) : null}
                      {recipients.invalid > 0 ? (
                        <Pill tone="warning" dot={false}>
                          {t.send.invalidCount(recipients.invalid)}
                        </Pill>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFileName(null);
                        setFileRows([]);
                      }}
                      aria-label={t.send.removeFile}
                      className="text-muted hover:text-ink"
                    >
                      <IconX size={15} />
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            {mode === "group" ? (
              <div className="mt-4">
                {groups.length === 0 ? (
                  <Notice tone="info" title={t.send.noGroupsTitle}>
                    {t.send.noGroupsBodyBefore}{" "}
                    <Link href="/app/contacts/groups" className="font-semibold underline">
                      {t.send.noGroupsCreate}
                    </Link>{" "}
                    {t.send.noGroupsBodyAfter}
                  </Notice>
                ) : (
                  <>
                    <Field
                      label={t.send.groupLabel}
                      htmlFor="group"
                      hint={t.send.groupHint}
                    >
                      <Select
                        id="group"
                        value={groupId}
                        onChange={(e) => loadGroup(e.target.value)}
                        disabled={groupLoading}
                      >
                        <option value="">{t.send.chooseGroup}</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {t.send.groupOption(group.name, group.memberCount)}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    {groupLoading ? (
                      <p className="mt-3 text-[13px] text-muted">{t.send.loadingGroup}</p>
                    ) : null}

                    {groupError ? (
                      <div className="mt-3">
                        <Notice tone="warning" title={t.send.groupNotUsed}>
                          {groupError}
                        </Notice>
                      </div>
                    ) : null}

                    {groupLabel && !groupError ? (
                      <p className="mt-3 text-[13px] text-muted">
                        {t.send.groupLoaded(groupRows.length, groupLabel)}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {recipients.raw > 0 ? <RecipientSummary recipients={recipients} overCeiling={overCeiling} ceiling={limits.ceiling} /> : null}
          </Card>
        ) : null}

        {step >= 1 ? (
          <Card className="p-5">
            <h2 className="text-[17px] font-bold text-ink">{t.send.messageHeading}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {t.send.messageSubheading}
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
              <Field
                label={t.send.senderIdLabel}
                htmlFor="sender"
                hint={
                  sender && !sender.supportsInboundReplies
                    ? t.send.senderNoReplies
                    : undefined
                }
              >
                <Select id="sender" value={senderId} onChange={(e) => setSenderId(e.target.value)}>
                  {senders.length === 0 ? <option value="">{t.send.noApprovedSender}</option> : null}
                  {senders.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.value}
                    </option>
                  ))}
                </Select>
              </Field>

              <div>
                <div className="flex items-end justify-between">
                  <label className="field-label" htmlFor="body">
                    {t.send.messageLabel}
                  </label>
                  <span className="mb-1.5 text-[12.5px] text-muted">
                    {info.visibleCharacters}/{info.segments > 1 ? info.concatenatedLimit : info.singleLimit}
                  </span>
                </div>
                <Textarea
                  id="body"
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t.send.bodyPlaceholder}
                />
                {templates.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setBody(t.body)}
                        className="rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-body hover:border-brand-200 hover:bg-brand-50"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                ) : null}
                {body.trim() && !bodyCheck.ok ? (
                  <p className="mt-2 text-[12.5px] font-medium text-danger-fg">
                    {bodyCheck.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,240px)]">
              <div>
                <span className="field-label">{t.send.sendTime}</span>
                <div className="flex flex-wrap gap-5 pt-1">
                  <Radio checked={timing === "now"} onChange={() => setTiming("now")} label={t.send.sendNow} />
                  <Radio
                    checked={timing === "later"}
                    onChange={() => setTiming("later")}
                    label={t.send.scheduleLater}
                  />
                </div>
                {timing === "later" ? (
                  <div className="mt-3 max-w-xs">
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      aria-label={t.send.scheduledAtLabel}
                    />
                    <p className="mt-1.5 text-[12.5px] text-muted">
                      {t.send.scheduleHint(limits.maxScheduleDays)}
                    </p>
                  </div>
                ) : null}
              </div>

              <Field label={t.send.timezoneLabel} htmlFor="tz">
                <Select id="tz" defaultValue="Asia/Manila" disabled>
                  <option value="Asia/Manila">{t.send.timezoneValue}</option>
                </Select>
              </Field>
            </div>

            <div className="mt-5">
              <TestSendPanel
                recipients={testRecipients}
                senderIdentityId={senderId}
                body={body}
                unitPriceCentavos={limits.unitPriceCentavos}
                segments={info.segments}
                disabledReason={
                  !senderId
                    ? t.send.testChooseSender
                    : !messageReady
                      ? t.send.testWriteMessage
                      : null
                }
              />
            </div>
          </Card>
        ) : null}

        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <label className="flex max-w-md items-start gap-2.5">
              <input
                type="checkbox"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-ink">
                  {t.send.authorizedLabel}
                </span>
                <span className="block text-[12.5px] text-muted">
                  {t.send.authorizedHint}
                </span>
              </span>
            </label>

            <div className="flex items-center gap-5">
              <Link href="/bulk" className="text-[13px] text-muted hover:text-brand-700">
                {t.send.largerCampaign}
                <span className="block font-semibold text-brand-600">{t.send.requestQuote}</span>
              </Link>
              {step === 0 ? (
                <Button disabled={!recipientsReady} onClick={() => setStep(1)}>
                  {t.send.continueToMessage} <IconArrowRight size={16} />
                </Button>
              ) : (
                <Button
                  disabled={!recipientsReady || !messageReady || !authorized || pending}
                  onClick={requestQuote}
                >
                  {pending ? t.send.pricing : quote ? t.send.reprice : t.send.reviewMessage}
                  <IconArrowRight size={16} />
                </Button>
              )}
            </div>
          </div>

          {error ? (
            <div className="mt-5">
              <Notice tone="danger" title={t.send.notAccepted}>
                {error.message}
              </Notice>
            </div>
          ) : null}
        </Card>

        {step === 2 && quote ? (
          <ReviewPanel
            quote={quote}
            name={campaignName}
            onNameChange={setCampaignName}
            onConfirm={confirmSend}
            pending={pending}
            defaultName={defaultCampaignName()}
          />
        ) : null}
      </div>

      <div className="min-w-0 space-y-4">
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-ink">{t.send.previewHeading}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {t.send.previewSubheading}
          </p>
          <div className="mt-4 flex justify-center">
            <PhoneFrame sender={sender?.value ?? "SENDER"} body={body} counter={`${info.visibleCharacters}/${info.singleLimit}`} />
          </div>
        </Card>

        <Card className="flex items-start gap-3.5 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600">
            <IconCalculator size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-ink">{t.send.estimatedCost}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">{t.send.finalCostNote}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">{t.send.basedOnSegments}</p>
            {includedCount > 0 && info.segments > 0 ? (
              <p className="mt-2 text-[15px] font-extrabold text-ink">
                {peso(estimatedCost)}
                <span className="ml-1 text-[12px] font-medium text-muted">
                  ({includedCount} × {info.segments} segment{info.segments === 1 ? "" : "s"})
                </span>
              </p>
            ) : null}
            {estimatedCost > limits.availableCentavos ? (
              <p className="mt-2 text-[12.5px] font-semibold text-danger-fg">
                More than your available credit of {peso(limits.availableCentavos)}.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function defaultCampaignName(): string {
  return `Send ${new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date())}`;
}

/**
 * The binding offer. Everything shown here came from the server and is tied to
 * one quote id; confirming sends exactly this and nothing else.
 */
function ReviewPanel({
  quote,
  name,
  onNameChange,
  onConfirm,
  pending,
  defaultName,
}: {
  quote: QuoteView;
  name: string;
  onNameChange: (value: string) => void;
  onConfirm: () => void;
  pending: boolean;
  defaultName: string;
}) {
  const t = useT();
  const expires = new Date(quote.expiresAt);
  const manila = (iso: string) =>
    new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  return (
    <Card className="p-5">
      <h2 className="text-[17px] font-bold text-ink">{t.send.reviewHeading}</h2>
      <p className="mt-0.5 text-[13px] text-muted">
        {t.send.quoteFixedUntil(manila(quote.expiresAt))}
      </p>

      <div className="mt-4 max-w-sm">
        <Field label={t.send.campaignName} htmlFor="campaign-name" hint={t.send.campaignNameHint}>
          <Input
            id="campaign-name"
            value={name}
            placeholder={defaultName}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </Field>
      </div>

      <dl className="mt-4">
        <DetailRow label={t.send.rowSender} value={quote.senderValue} />
        <DetailRow label={t.send.rowRecipients} value={quote.recipientCount} />
        <DetailRow
          label={t.send.rowEncoding}
          value={t.send.encodingValue(
            quote.encoding === "GSM7" ? "GSM-7" : "Unicode",
            quote.segmentsPerMessage,
          )}
        />
        <DetailRow label={t.send.rowSegmentsBilled} value={quote.segmentTotal} />
        <DetailRow label={t.send.rowPricePerSegment} value={quote.unitPriceLabel} />
        <DetailRow
          label={t.send.rowMaxCost}
          value={<span className="text-[15px]">{quote.totalLabel}</span>}
        />
        <DetailRow label={t.send.rowAvailableCredit} value={quote.availableLabel} />
        <DetailRow
          label={t.send.rowWhen}
          value={
            quote.scheduledAt
              ? t.send.scheduledFor(manila(quote.scheduledAt))
              : t.send.immediately
          }
        />
      </dl>

      {quote.exclusions.invalid + quote.exclusions.duplicate + quote.exclusions.suppressed > 0 ? (
        <p className="mt-3 text-[12.5px] text-muted">
          {t.send.excludedBeforePricing(
            quote.exclusions.invalid,
            quote.exclusions.duplicate,
            quote.exclusions.suppressed,
          )}
        </p>
      ) : null}

      <div className="mt-4 rounded-[9px] bg-canvas p-3">
        <p className="text-[12.5px] font-semibold text-ink">{t.send.sampleRecipients}</p>
        <p className="mt-1 text-[12.5px] text-muted">
          {quote.sampleMasked.join(", ")}
          {quote.recipientCount > quote.sampleMasked.length
            ? t.send.andMore(quote.recipientCount - quote.sampleMasked.length)
            : ""}
        </p>
      </div>

      {/* Only offered when the sender can actually receive a reply. */}
      {quote.senderAcceptsReplies ? null : (
        <p className="mt-3 text-[12.5px] text-muted">
          {t.send.noRepliesNote}
        </p>
      )}

      {quote.sufficientFunds ? null : (
        <div className="mt-4">
          <Notice tone="danger" title={t.send.notEnoughCredit}>
            {t.send.notEnoughCreditBody(quote.totalLabel, quote.availableLabel)}
          </Notice>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={onConfirm} disabled={pending || !quote.sufficientFunds}>
          {pending
            ? t.send.submitting
            : quote.scheduledAt
              ? t.send.scheduleN(quote.recipientCount)
              : t.send.sendN(quote.recipientCount)}
        </Button>
        <p className="text-[12.5px] text-muted">
          {t.send.cannotRecall}
        </p>
      </div>

      {expires.getTime() < Date.now() ? (
        <div className="mt-4">
          <Notice tone="warning" title={t.send.quoteExpired}>
            {t.send.quoteExpiredBody}
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}

function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="mb-1 flex items-center gap-3">
      {labels.map((label, index) => (
        <li key={label} className="flex flex-1 items-center gap-3 last:flex-none">
          <span className="flex items-center gap-2.5">
            <span
              className={cx(
                "flex h-7 w-7 items-center justify-center rounded-full text-[12.5px] font-bold",
                index <= step ? "bg-brand-600 text-white" : "bg-neutral-bg text-muted",
              )}
            >
              {index + 1}
            </span>
            <span
              className={cx(
                "text-[13.5px] font-semibold",
                index <= step ? "text-ink" : "text-muted",
              )}
            >
              {label}
            </span>
          </span>
          {index < labels.length - 1 ? (
            <span className="h-px flex-1 bg-line" aria-hidden="true" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      role="tab"
      className={cx(
        "-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-[13.5px] font-semibold transition-colors",
        active
          ? "border-brand-600 bg-brand-50/60 text-brand-700"
          : "border-transparent text-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function Radio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-brand-600"
      />
      {label}
    </label>
  );
}

function RecipientSummary({
  recipients,
  overCeiling,
  ceiling,
}: {
  recipients: { unique: string[]; invalid: number; duplicate: number; raw: number };
  overCeiling: number;
  ceiling: number;
}) {
  const t = useT();
  return (
    <div className="mt-4 rounded-[10px] border border-line bg-canvas p-4">
      <p className="text-[13px] font-bold text-ink">{t.send.previewTitle}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
        <Count label={t.send.countRowsEntered} value={recipients.raw} />
        <Count label={t.send.countUniqueValid} value={recipients.unique.length} />
        <Count label={t.send.countDuplicates} value={recipients.duplicate} />
        <Count label={t.send.countInvalid} value={recipients.invalid} />
      </dl>
      <p className="mt-3 flex items-start gap-2 text-[12.5px] text-muted">
        <IconInfo size={14} className="mt-px shrink-0" />
        {t.send.formatOnlyNote}
      </p>
      {overCeiling > 0 ? (
        <div className="mt-3">
          <Notice tone="warning" title={t.send.aboveCeiling(ceiling)}>
            {overCeiling} recipients are over the limit for self-service sending. Request a bulk
            quote for the full list.
          </Notice>
        </div>
      ) : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-[15px] font-bold text-ink">{value}</dd>
    </div>
  );
}

function PhoneFrame({
  sender,
  body,
  counter,
}: {
  sender: string;
  body: string;
  counter: string;
}) {
  const t = useT();
  return (
    <div className="w-[228px]">
      <div className="rounded-[26px] border-[6px] border-navy-900 bg-white p-3">
        <div className="flex items-center justify-between px-1 pb-2 text-[10.5px] font-semibold text-ink">
          <span>9:41</span>
          <span className="flex items-center gap-1 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span className="h-2 w-3.5 rounded-[2px] border border-current" />
          </span>
        </div>

        <div className="border-b border-line pb-2 text-center">
          <span className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-bg text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7Z" />
            </svg>
          </span>
          <span className="block text-[11.5px] font-bold text-ink">{sender}</span>
          <span className="mt-1 block text-[10px] text-muted">{t.send.phoneTextMessage}</span>
        </div>

        <div className="py-3">
          <div className="min-h-[54px] rounded-[14px] bg-[#f1f3f7] px-3 py-2.5 text-[12.5px] leading-snug text-ink">
            {body.trim() || (
              <span className="text-muted">{t.send.phonePlaceholder}</span>
            )}
          </div>
          <p className="mt-1.5 text-right text-[11px] text-muted">{counter}</p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5">
          <span className="text-[16px] leading-none text-muted">+</span>
          <span className="flex-1 text-[11.5px] text-muted">{t.send.phoneTextMessage}</span>
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
