import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { formatEther, formatUnits } from "ethers";
import { MAINNET_SIGNING_BLOCKED_MESSAGE, isTestnet, networkByChainId } from "../config/networks";
import { approvalQueue, type PendingRequest } from "../dapp/approvalCenter";
import { userRejected } from "../dapp/errors";
import { sendPreparedTransaction, signPersonalMessage, signTypedDataV4 } from "../dapp/execute";
import { parseChainId, type DappTransaction } from "../dapp/router";
import { getWalletState, switchChain } from "../dapp/walletState";
import { analyzeEvmTransaction } from "../security/analyzeTransaction";
import { decodeApprovalCall, parseExactAmount, rewriteApprovalAmount, suggestExactAmount, type ApprovalCall } from "../security/approvalRewrite";
import { SIMULATION_LIMITATIONS, reviewMessage, reviewTransaction, reviewTypedData, type Review } from "../security/review";
import { simulateTransaction, type PreparedTransaction } from "../security/simulate";
import { summarizeTypedData, type TypedDataSummary } from "../security/typedData";
import { readTokenInfo, type TokenInfo } from "../wallet/approvalsChain";
import { hasInteracted } from "../wallet/localStore";
import { errorMessage } from "../wallet/rpc";
import { theme } from "../theme";
import { BottomSheet, FadeIn, SpringPressable } from "./motion";

const riskColor: Record<Review["level"], string> = {
  info: theme.colors.success,
  warning: theme.colors.warning,
  high: "#F29B38",
  critical: theme.colors.danger
};

function short(value: string) {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function originLabel(origin: string) {
  try { return new URL(origin).host || origin; } catch { return origin; }
}

/** Renders the head of the approval queue as a bottom sheet. Mounted once in App. */
export function RequestHost() {
  const [head, setHead] = useState<PendingRequest | null>(null);
  const [queued, setQueued] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => approvalQueue.subscribe((next, size) => { setHead(next); setQueued(size); }), []);
  // Explain sheets that close on their own (WalletConnect expiry or disconnect).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = approvalQueue.onCancelled(({ peer, message }) => {
      setNotice(`${peer.name || originLabel(peer.origin)}: ${message}`);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setNotice(null), 4500);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, []);
  return (
    <>
      <BottomSheet visible={!!head} onClose={() => head?.reject(userRejected())}>
        {head && <RequestBody key={head.id} request={head} queued={queued} />}
      </BottomSheet>
      {notice && (
        <FadeIn key={notice} style={styles.toast} >
          <Text style={styles.toastText} accessibilityRole="alert">{notice}</Text>
        </FadeIn>
      )}
    </>
  );
}

function PeerHeader({ request }: { request: PendingRequest }) {
  const network = networkByChainId(request.chainId);
  return (
    <View style={styles.peer}>
      {request.peer.icon?.startsWith("https://") ? <Image source={{ uri: request.peer.icon }} style={styles.peerIcon} /> : <View style={styles.peerIcon}><Text style={styles.peerIconText}>{originLabel(request.peer.origin).slice(0, 1).toUpperCase()}</Text></View>}
      <View style={{ flex: 1 }}>
        <Text style={styles.peerName} numberOfLines={1}>{request.peer.name || originLabel(request.peer.origin)}</Text>
        <Text style={styles.peerMeta} numberOfLines={1}>{originLabel(request.peer.origin)} · {request.peer.source === "walletconnect" ? "WalletConnect" : request.peer.source === "internal" ? "TREX" : "Browser"} · {network?.name ?? `Chain ${request.chainId}`}</Text>
      </View>
    </View>
  );
}

function Buttons({ approveLabel, onApprove, onReject, disabled, busy }: { approveLabel: string; onApprove: () => void; onReject: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <View style={styles.buttons}>
      <Pressable style={styles.reject} onPress={onReject} disabled={busy} accessibilityRole="button"><Text style={styles.rejectText}>REJECT</Text></Pressable>
      <SpringPressable containerStyle={{ flex: 1.4 }} style={[styles.approve, disabled && styles.approveDisabled]} onPress={onApprove} disabled={disabled || busy} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.approveText}>{approveLabel}</Text>}
      </SpringPressable>
    </View>
  );
}

function Findings({ review }: { review: Review }) {
  return (
    <View>
      <View style={[styles.riskBadge, { borderColor: riskColor[review.level] }]}>
        <Text style={[styles.riskBadgeText, { color: riskColor[review.level] }]}>RISK: {review.level.toUpperCase()}</Text>
      </View>
      {review.blockedReason && <View style={styles.blocked}><Text style={styles.blockedTitle}>Signing blocked</Text><Text style={styles.blockedText}>{review.blockedReason}</Text></View>}
      {review.findings.map((finding, index) => (
        <FadeIn key={`${finding.title}-${index}`} delay={index * 40} style={styles.finding}>
          <View style={[styles.dot, { backgroundColor: riskColor[finding.level] }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.findingTitle}>{finding.title}</Text>
            <Text style={styles.findingText}>{finding.detail}</Text>
          </View>
        </FadeIn>
      ))}
      <Text style={styles.limitations}>{SIMULATION_LIMITATIONS}</Text>
    </View>
  );
}

function RequestBody({ request, queued }: { request: PendingRequest; queued: number }) {
  return (
    <ScrollView style={{ maxHeight: 640 }} keyboardShouldPersistTaps="handled">
      <PeerHeader request={request} />
      {queued > 1 && <Text style={styles.queued}>{queued - 1} more request{queued > 2 ? "s" : ""} waiting</Text>}
      {request.type === "connect" && <ConnectBody request={request} />}
      {request.type === "switchChain" && <SwitchBody request={request} />}
      {request.type === "sign" && request.request.kind === "transaction" && <TransactionBody request={request} tx={request.request.tx} />}
      {request.type === "sign" && request.request.kind === "personal_sign" && <MessageBody request={request} />}
      {request.type === "sign" && request.request.kind === "typed_data" && <TypedBody request={request} />}
    </ScrollView>
  );
}

function ConnectBody({ request }: { request: Extract<PendingRequest, { type: "connect" }> }) {
  const state = getWalletState();
  return (
    <View>
      <Text style={styles.title}>Connect to this site?</Text>
      <Text style={styles.body}>The site will see the address of your active account and can ask you to sign. It cannot move funds without a separate approval from you.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>ACCOUNT</Text>
        <Text style={styles.value}>{state.address ? short(state.address) : "No account"}</Text>
      </View>
      {!state.network.testnet && <Text style={styles.note}>You are on {state.network.name}. Connecting and reading are allowed, but this test build will not sign on mainnet.</Text>}
      <Buttons approveLabel="CONNECT" onApprove={() => request.resolve(true)} onReject={() => request.resolve(false)} disabled={!state.address} />
    </View>
  );
}

function SwitchBody({ request }: { request: Extract<PendingRequest, { type: "switchChain" }> }) {
  const target = networkByChainId(request.chainId);
  const current = getWalletState().network;
  const [error, setError] = useState("");
  return (
    <View>
      <Text style={styles.title}>Switch network?</Text>
      <Text style={styles.body}>The site wants TREX to switch from {current.name} to {target?.name ?? `chain ${request.chainId}`}.</Text>
      {target && !target.testnet && <Text style={styles.note}>{target.name} is a mainnet. TREX will only read and connect there; signing stays disabled.</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Buttons
        approveLabel="SWITCH"
        onApprove={() => {
          try { switchChain(parseChainId(request.chainId)); request.resolve(true); } catch (e) { setError(errorMessage(e, "Could not switch network.")); }
        }}
        onReject={() => request.resolve(false)}
        disabled={!target}
      />
    </View>
  );
}

function useSigner(request: Extract<PendingRequest, { type: "sign" }>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  async function run(task: (accountId: string, guard: () => void) => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const state = getWalletState();
      if (!state.accountId || !state.address || state.address.toLowerCase() !== request.request.address.toLowerCase()) {
        throw new Error("The active account changed since the site asked. Reject and try again from the site.");
      }
      if (state.network.chainId !== request.chainId) throw new Error("The network changed since the site asked. Reject and try again.");
      const result = await task(state.accountId, () => approvalQueue.assertPending(request.id));
      request.resolve(result);
    } catch (e) {
      if (mounted.current) setError(errorMessage(e, "Signing failed."));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, run };
}

function RiskAck({ review, value, onChange }: { review: Review | null; value: boolean; onChange: (v: boolean) => void }) {
  if (!review || review.level !== "critical" || review.blockedReason) return null;
  return (
    <View style={styles.ack}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.colors.danger, false: theme.colors.border }} thumbColor={theme.colors.text} />
      <Text style={styles.ackText}>I understand this request is high risk and I trust this site.</Text>
    </View>
  );
}

function TransactionBody({ request, tx }: { request: Extract<PendingRequest, { type: "sign" }>; tx: DappTransaction }) {
  const network = getWalletState().network;
  const analysis = useMemo(() => analyzeEvmTransaction(tx.data ?? "0x"), [tx.data]);
  const approval = useMemo<ApprovalCall | null>(() => decodeApprovalCall(tx.data), [tx.data]);
  const [review, setReview] = useState<Review | null>(null);
  const [prepared, setPrepared] = useState<PreparedTransaction | null>(null);
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [exact, setExact] = useState(true);
  const [exactInput, setExactInput] = useState("");
  const [exactError, setExactError] = useState("");
  const [ack, setAck] = useState(false);
  const { busy, error, run } = useSigner(request);
  const canLimit = !!approval && (approval.kind === "erc20" || approval.kind === "permit2") && approval.unlimited;
  const tokenAddress = approval?.kind === "permit2" ? approval.token : tx.to ?? null;

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ simulation, prepared: prep }, first, info] = await Promise.all([
        simulateTransaction(network, tx),
        tx.to ? hasInteracted(tx.from, network.chainId, tx.to).then((seen) => !seen).catch(() => null) : Promise.resolve(null),
        approval && approval.kind !== "setApprovalForAll" && tokenAddress ? readTokenInfo(network, tokenAddress, tx.from) : Promise.resolve(null)
      ]);
      if (!active) return;
      setPrepared(prep);
      setToken(info);
      if (info && canLimit) {
        const suggestion = suggestExactAmount({ balance: info.balance });
        if (suggestion) setExactInput(formatUnits(suggestion, info.decimals));
      }
      setReview(reviewTransaction({
        activeChainId: network.chainId,
        requestedChainId: tx.chainId ? Number(BigInt(tx.chainId)) : null,
        to: tx.to ?? null,
        data: tx.data,
        analysis,
        approval,
        simulation,
        firstInteraction: first,
        symbol: network.symbol,
        tokenDecimals: info?.decimals ?? null,
        tokenSymbol: info?.symbol ?? null
      }));
    })().catch((e) => {
      if (active) setReview({ level: "warning", findings: [{ level: "warning", title: "Checks failed", detail: errorMessage(e, "Could not run security checks.") }], blockedReason: isTestnet(network.chainId) ? null : MAINNET_SIGNING_BLOCKED_MESSAGE });
    });
    return () => { active = false; };
  }, [tx, network, analysis, approval, canLimit, tokenAddress]);

  async function approve() {
    await run(async (accountId, guard) => {
      let finalPrepared = prepared;
      if (canLimit && exact) {
        const decimals = token?.decimals ?? 18;
        let amount: bigint;
        try { amount = parseExactAmount(exactInput, decimals); } catch (e) { setExactError(errorMessage(e, "Invalid amount.")); throw new Error("Fix the exact approval amount first."); }
        setExactError("");
        const data = rewriteApprovalAmount(tx.data ?? "0x", amount);
        const resim = await simulateTransaction(network, { ...tx, data, gas: undefined });
        if (resim.simulation.status === "reverted") throw new Error(`The exact-amount approval would revert: ${resim.simulation.revertReason ?? "no reason"}.`);
        finalPrepared = resim.prepared;
      }
      if (!finalPrepared) throw new Error("The transaction is still being checked.");
      return sendPreparedTransaction({ accountId, expectedAddress: request.request.address, network, prepared: finalPrepared, origin: request.peer.origin, guard });
    });
  }

  const value = tx.value ? BigInt(tx.value) : 0n;
  return (
    <View>
      <Text style={styles.title}>{approval ? (approval.kind === "setApprovalForAll" ? "Collection approval" : "Token approval") : "Review transaction"}</Text>
      <View style={styles.card}>
        <Row label="FROM" value={short(tx.from)} />
        <Row label="TO" value={tx.to ? short(tx.to) : "New contract"} />
        <Row label="AMOUNT" value={`${formatEther(value)} ${network.symbol}`} />
        <Row label="METHOD" value={analysis.method} />
        {prepared?.gasLimit && prepared.fee && <Row label="MAX FEE" value={`${formatEther(prepared.gasLimit * prepared.fee.cap)} ${network.symbol}`} />}
      </View>
      {canLimit && (
        <View style={styles.exactCard}>
          <View style={styles.exactHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.exactTitle}>Self-cleaning approval</Text>
              <Text style={styles.findingText}>The site asked for UNLIMITED access to {token?.symbol ?? "this token"}. Approve only what you need, so nothing stays open afterwards.</Text>
            </View>
            <Switch value={exact} onValueChange={setExact} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} thumbColor={theme.colors.text} />
          </View>
          {exact && (
            <>
              <Text style={styles.label}>EXACT AMOUNT {token ? `(${token.symbol}, balance ${formatUnits(token.balance, token.decimals)})` : ""}</Text>
              <TextInput value={exactInput} onChangeText={setExactInput} keyboardType="decimal-pad" placeholder="Amount the site needs" placeholderTextColor={theme.colors.muted} style={styles.input} />
              <Text style={styles.hint}>Prefilled with your balance because the needed amount cannot be read from an approval alone. Lower it to what the site will spend.</Text>
              {!!exactError && <Text style={styles.error}>{exactError}</Text>}
            </>
          )}
        </View>
      )}
      {!review ? <View style={styles.loading}><ActivityIndicator color={theme.colors.primaryBright} /><Text style={styles.peerMeta}>Simulating and checking…</Text></View> : <Findings review={review} />}
      <RiskAck review={review} value={ack} onChange={setAck} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Buttons
        approveLabel={review?.blockedReason ? "BLOCKED" : "APPROVE & SIGN"}
        onApprove={approve}
        onReject={() => request.reject(userRejected())}
        disabled={!review || !!review.blockedReason || !prepared || (review.level === "critical" && !ack && !(canLimit && exact))}
        busy={busy}
      />
    </View>
  );
}

function MessageBody({ request }: { request: Extract<PendingRequest, { type: "sign" }> }) {
  const sign = request.request as Extract<typeof request.request, { kind: "personal_sign" }>;
  const review = useMemo(() => reviewMessage({ activeChainId: request.chainId, displayMessage: sign.displayMessage, rawMessage: sign.message, origin: request.peer.origin }), [request, sign]);
  const [ack, setAck] = useState(false);
  const { busy, error, run } = useSigner(request);
  return (
    <View>
      <Text style={styles.title}>Sign message</Text>
      <View style={styles.messageBox}><Text selectable style={styles.message}>{sign.displayMessage.slice(0, 4000)}</Text></View>
      <Findings review={review} />
      <RiskAck review={review} value={ack} onChange={setAck} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Buttons
        approveLabel={review.blockedReason ? "BLOCKED" : "SIGN"}
        onApprove={() => run((accountId, guard) => signPersonalMessage(accountId, sign.address, request.chainId, sign.message, guard))}
        onReject={() => request.reject(userRejected())}
        disabled={!!review.blockedReason || (review.level === "critical" && !ack)}
        busy={busy}
      />
    </View>
  );
}

function TypedBody({ request }: { request: Extract<PendingRequest, { type: "sign" }> }) {
  const sign = request.request as Extract<typeof request.request, { kind: "typed_data" }>;
  const parsed = useMemo<{ summary: TypedDataSummary | null; error: string }>(() => {
    try { return { summary: summarizeTypedData(sign.typedData), error: "" }; } catch (e) { return { summary: null, error: errorMessage(e, "Invalid typed data.") }; }
  }, [sign]);
  const review = useMemo(() => parsed.summary ? reviewTypedData({ activeChainId: request.chainId, summary: parsed.summary, nowSeconds: Math.floor(Date.now() / 1000), origin: request.peer.origin }) : null, [parsed, request]);
  const [ack, setAck] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const { busy, error, run } = useSigner(request);
  return (
    <View>
      <Text style={styles.title}>{parsed.summary?.permit ? "Token permit signature" : "Sign typed data"}</Text>
      {parsed.error ? <Text style={styles.error}>{parsed.error}</Text> : null}
      {parsed.summary && (
        <View style={styles.card}>
          <Row label="TYPE" value={parsed.summary.payload.primaryType} />
          {typeof parsed.summary.payload.domain.name === "string" && <Row label="APP" value={String(parsed.summary.payload.domain.name).slice(0, 40)} />}
          <Row label="CHAIN" value={parsed.summary.chainId === null ? "Not specified" : networkByChainId(parsed.summary.chainId)?.name ?? String(parsed.summary.chainId)} />
          {parsed.summary.permit && <Row label="SPENDER" value={short(parsed.summary.permit.spender)} />}
        </View>
      )}
      {review && <Findings review={review} />}
      {parsed.summary && (
        <Pressable onPress={() => setShowRaw((v) => !v)}><Text style={styles.link}>{showRaw ? "HIDE RAW DATA" : "SHOW RAW DATA"}</Text></Pressable>
      )}
      {showRaw && parsed.summary && <View style={styles.messageBox}><Text selectable style={styles.message}>{JSON.stringify(parsed.summary.payload.message, null, 2).slice(0, 4000)}</Text></View>}
      <RiskAck review={review} value={ack} onChange={setAck} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Buttons
        approveLabel={review?.blockedReason ? "BLOCKED" : "SIGN"}
        onApprove={() => run((accountId, guard) => signTypedDataV4(accountId, sign.address, request.chainId, sign.typedData, guard))}
        onReject={() => request.reject(userRejected())}
        disabled={!review || !!review.blockedReason || (review.level === "critical" && !ack)}
        busy={busy}
      />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: { position: "absolute", left: 16, right: 16, bottom: 28, backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 14, padding: 14, shadowColor: "#000000", shadowOpacity: 0.4, shadowRadius: 12, elevation: 12 },
  toastText: { color: theme.colors.text, fontSize: 11, lineHeight: 17 },
  peer: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  peerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderColor: theme.colors.border, alignItems: "center", justifyContent: "center" },
  peerIconText: { color: theme.colors.primaryBright, fontWeight: "900", fontSize: 16 },
  peerName: { color: theme.colors.text, fontSize: 14, fontWeight: "800" },
  peerMeta: { color: theme.colors.muted, fontSize: 10, marginTop: 3 },
  queued: { color: theme.colors.warning, fontSize: 10, marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: "900", marginBottom: 8 },
  body: { color: theme.colors.muted, fontSize: 12, lineHeight: 19, marginBottom: 12 },
  note: { color: theme.colors.warning, fontSize: 11, lineHeight: 17, marginVertical: 8 },
  card: { backgroundColor: theme.colors.background, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5, gap: 12 },
  label: { color: theme.colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  value: { color: theme.colors.text, fontSize: 12, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  riskBadge: { alignSelf: "flex-start", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  riskBadgeText: { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  blocked: { backgroundColor: "#3A120E", borderColor: theme.colors.danger, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  blockedTitle: { color: theme.colors.danger, fontSize: 12, fontWeight: "900", marginBottom: 4 },
  blockedText: { color: theme.colors.text, fontSize: 11, lineHeight: 17 },
  finding: { flexDirection: "row", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  findingTitle: { color: theme.colors.text, fontSize: 12, fontWeight: "800" },
  findingText: { color: theme.colors.muted, fontSize: 11, lineHeight: 17, marginTop: 2 },
  limitations: { color: "#8F6B4B", fontSize: 9, lineHeight: 14, marginTop: 10 },
  exactCard: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.primary, borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  exactHeader: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 8 },
  exactTitle: { color: theme.colors.primaryBright, fontSize: 13, fontWeight: "900" },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.background, color: theme.colors.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, marginTop: 6 },
  hint: { color: theme.colors.muted, fontSize: 10, lineHeight: 15, marginTop: 6 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 16 },
  ack: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  ackText: { color: theme.colors.text, fontSize: 11, flex: 1, lineHeight: 16 },
  messageBox: { backgroundColor: theme.colors.background, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginBottom: 12, maxHeight: 220 },
  message: { color: theme.colors.text, fontSize: 11, lineHeight: 17 },
  link: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginVertical: 10 },
  error: { color: theme.colors.danger, fontSize: 11, lineHeight: 17, marginTop: 10 },
  buttons: { flexDirection: "row", gap: 10, marginTop: 16 },
  reject: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  rejectText: { color: theme.colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  approve: { backgroundColor: theme.colors.primary, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingVertical: 14, minHeight: 48 },
  approveDisabled: { backgroundColor: theme.colors.border },
  approveText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", letterSpacing: 1 }
});
