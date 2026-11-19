import React, { useState } from "react";
import { ScrollView, Text } from "react-native";
import type { EvmNetwork } from "../config/networks";
import { inspectErc20Token } from "../wallet/tokens";
import type { TokenBalance } from "../wallet/tokens";
import { saveCustomToken } from "../wallet/tokenStore";
import { parseRecipientQr } from "../scan/qr";
import { FadeIn } from "./motion";
import { QrScanner } from "./QrScanner";
import { AddressField, Card, Detail, Disclaimer, ErrorText, FieldLabel, GhostButton, PrimaryButton, ScreenHeader, WarningPanel, ui } from "./ui";

export function AddToken({ network, walletAddress, onBack, onAdded }: {
  network: EvmNetwork;
  walletAddress: string;
  onBack: () => void;
  onAdded: () => void;
}) {
  const [contractAddress, setContractAddress] = useState("");
  const [token, setToken] = useState<TokenBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  async function inspect() {
    setBusy(true);
    setError("");
    setToken(null);
    try {
      setToken(await inspectErc20Token(network, contractAddress.trim(), walletAddress));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read this token contract.");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await saveCustomToken({ chainId: token.chainId, contractAddress: token.contractAddress, name: token.name, symbol: token.symbol, decimals: token.decimals });
      onAdded();
    } catch {
      setError("Token details could not be saved on this device.");
    } finally {
      setBusy(false);
    }
  }

  function onScanned(data: string): string | null {
    try {
      // A contract QR is a plain address; for an ethereum:<token>/transfer code, the token is the contract.
      const scan = parseRecipientQr(data);
      setContractAddress(scan.tokenContract ?? scan.address);
      setToken(null);
      setScanning(false);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Could not read this QR code.";
    }
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader kicker="ASSETS" title="Add token" onBack={onBack} />
      <FadeIn delay={60}>
        <Text style={ui.body}>Add an ERC-20 contract on {network.name}. TREX reads the contract directly from the network.</Text>
        <FieldLabel>TOKEN CONTRACT ADDRESS</FieldLabel>
        <AddressField value={contractAddress} onChangeText={(value) => { setContractAddress(value); setToken(null); }} onScan={() => setScanning(true)} />
        {!token && <PrimaryButton label="CHECK TOKEN" busyLabel="READING CONTRACT…" busy={busy} disabled={!contractAddress.trim()} onPress={inspect} />}
      </FadeIn>
      {token && (
        <FadeIn trigger={token.contractAddress}>
          <Card>
            <Text style={ui.cardTitle}>{token.name}</Text>
            <Text style={ui.sheetKicker}>{token.symbol}</Text>
            <Detail label="YOUR BALANCE" value={`${token.balance} ${token.symbol}`} emphasis />
            <Detail label="CONTRACT" value={token.contractAddress} />
            <Detail label="DETAILS" value={`Decimals ${token.decimals} · Chain ${token.chainId}`} />
          </Card>
          <WarningPanel title="Unverified token">
            Token names, symbols and balances come from the contract and can be misleading. Verify this exact contract address from a trusted source. Adding a token does not make it safe.
          </WarningPanel>
          <PrimaryButton label="ADD TO ASSETS" busyLabel="SAVING…" busy={busy} onPress={add} />
          <GhostButton label="CHECK ANOTHER CONTRACT" onPress={() => setToken(null)} disabled={busy} />
        </FadeIn>
      )}
      <ErrorText message={error} />
      <Disclaimer>READ-ONLY TOKEN LOOKUP · NO APPROVAL OR TRANSFER IS PERFORMED</Disclaimer>
      <QrScanner visible={scanning} title="Scan contract" hint="Scan a QR that contains the token's contract address." onScan={onScanned} onClose={() => setScanning(false)} />
    </ScrollView>
  );
}
