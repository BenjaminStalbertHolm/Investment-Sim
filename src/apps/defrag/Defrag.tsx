import { useEffect, useMemo, useState } from 'react';
import { simulation } from '../../sim/client';
import { FUNDS } from '../../sim/data/funds';
import { rebalanceOrders, type Target } from '../../sim/desk';
import { INDUSTRIES } from '../../world/industries';
import { showError, useAccountData, useGame } from '../../state/game';
import { usePrograms } from '../../state/programs';
import { companyOf } from '../../sites/hooks';
import { Confirm } from '../../ui98/Modal';
import { AppMenuBar } from '../AppMenuBar';
import { count, money, pct } from '../format';
import type { AppProps } from '../types';
import '../programs.css';

const BLOCKS = 240;
const COLOURS = ['#2050d0', '#c02020', '#20a020', '#e0a000', '#8020c0', '#00a0a0', '#d06020', '#606060', '#e060a0', '#40c0f0'];

interface Holding {
  key: string;
  label: string;
  company?: number;
  fund?: number;
  units: number;
  price: number;
  value: number;
  colour: string;
}

/**
 * Portfolio Defragmenter (spec §4A): holdings as coloured blocks, fragmented across the disk; set target weights and
 * "defragment" to generate rebalancing orders, confirmed before they go. With a Trader on staff it can run every month.
 */
export default function Defrag({ windowId }: AppProps) {
  const positions = useGame((s) => s.snapshot?.positions ?? []);
  const worth = useGame((s) => s.snapshot?.account.netWorth ?? 0);
  const funds = useAccountData(() => simulation().funds());
  const { tickers } = useGame.getState().directory;
  const targets = usePrograms((s) => s.defrag.targets);
  const [orders, setOrders] = useState<ReturnType<typeof rebalanceOrders>>();
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [step, setStep] = useState(0);

  const holdings: Holding[] = useMemo(() => {
    const list: Holding[] = [];
    for (const p of positions) {
      if (p.shares <= 0) continue;
      const industry = companyOf(useGame.getState().directory.genomes[p.company]).industry;
      list.push({ key: `c${p.company}`, label: tickers[p.company], company: p.company, units: p.shares, price: p.last, value: p.value, colour: COLOURS[INDUSTRIES.indexOf(industry) % COLOURS.length] });
    }
    for (const f of funds?.positions ?? []) list.push({ key: `f${f.fund}`, label: FUNDS[f.fund].ticker, fund: f.fund, units: f.units, price: f.nav, value: f.value, colour: '#ffd000' });
    return list.sort((a, b) => b.value - a.value);
  }, [positions, funds, tickers]);

  const weightOf = (h: Holding) => targets.find((t) => (h.fund !== undefined ? t.fund === h.fund : t.company === h.company))?.weight;
  const setWeight = (h: Holding, w: number) => {
    const rest = targets.filter((t) => !(h.fund !== undefined ? t.fund === h.fund : t.company === h.company));
    usePrograms.setState({ defrag: { targets: [...rest, { ...(h.fund !== undefined ? { fund: h.fund } : { company: h.company }), weight: w }] } });
  };
  const current = (h: Holding) => (worth > 0 ? h.value / worth : 0);
  const effective: Target[] = holdings.map((h) => ({ ...(h.fund !== undefined ? { fund: h.fund } : { company: h.company }), weight: weightOf(h) ?? current(h) }));
  const total = effective.reduce((a, t) => a + t.weight, 0);

  // The disk: blocks by value, cash as free space, scattered the way a fragmented disk looks; defragmenting sorts them.
  const disk = useMemo(() => {
    const blocks: string[] = [];
    for (const h of holdings) for (let k = 0; k < Math.max(1, Math.round((h.value / Math.max(worth, 1)) * BLOCKS)); k++) blocks.push(h.colour);
    while (blocks.length < BLOCKS) blocks.push('#fff');
    blocks.length = BLOCKS;
    let seed = 7;
    for (let i = blocks.length - 1; i > 0; i--) {
      seed = (seed * 16807) % 2147483647;
      const j = seed % (i + 1);
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    }
    return blocks;
  }, [holdings, worth]);
  const shown = useMemo(() => {
    if (phase === 'idle') return disk;
    const sorted = [...disk].sort((a, b) => (a === '#fff' ? 1 : 0) - (b === '#fff' ? 1 : 0) || a.localeCompare(b));
    return disk.map((b, k) => (k < step ? sorted[k] : b));
  }, [disk, phase, step]);

  useEffect(() => {
    if (phase !== 'running') return;
    const timer = setInterval(() => setStep((s) => s + 6), 30);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (phase === 'running' && step >= BLOCKS) setPhase('done');
  }, [phase, step]);

  const analyse = () => {
    if (total > 1 + 1e-9) return showError('The target weights add up to more than 100%.');
    const price = (t: { company?: number; fund?: number }) => holdings.find((h) => (t.fund !== undefined ? h.fund === t.fund : h.company === t.company))?.price ?? 0;
    setOrders(rebalanceOrders(effective, holdings, price, worth));
  };
  const send = async () => {
    const list = orders ?? [];
    setOrders(undefined);
    for (const o of list) {
      const r = o.fund !== undefined
        ? await simulation().tradeFund(o.fund, o.shares)
        : await simulation().placeOrder({ company: o.company!, side: o.shares > 0 ? 'buy' : 'sell', type: 'market', shares: Math.abs(o.shares), tif: 'day' });
      if ('error' in r) showError(r.error);
    }
    setStep(0);
    setPhase('running');
  };
  const schedule = () =>
    void simulation()
      .deskAction({ do: 'addRule', rule: { kind: 'rebalance', targets: effective.filter((t) => t.weight > 0) } })
      .then((e) => (e ? showError(e) : useGame.setState({ notice: { text: 'Monthly defragmentation scheduled with your Trader.', at: Date.now() } })));

  return (
    <div className="app defrag">
      <AppMenuBar windowId={windowId} />
      <div className="defrag-disk sunken-panel" aria-label="Holdings as blocks">
        {shown.map((c, k) => (
          <span key={k} style={{ background: c }} />
        ))}
      </div>
      <div className="defrag-legend">
        {holdings.map((h) => (
          <span key={h.key}>
            <i style={{ background: h.colour }} /> {h.label}
          </span>
        ))}
        <span><i style={{ background: '#fff' }} /> Cash (free space)</span>
      </div>
      <div className="sunken-panel table-view">
        <table>
          <thead>
            <tr><th>Holding</th><th className="right">Value</th><th className="right">Now</th><th className="right">Target %</th></tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.key}>
                <td>{h.label} ({count(h.units)})</td>
                <td className="right">{money(h.value)}</td>
                <td className="right">{pct(current(h))}</td>
                <td className="right">
                  <input type="number" min={0} max={100} step={1} size={4} aria-label={`Target for ${h.label}`} value={Math.round((weightOf(h) ?? current(h)) * 1000) / 10} onChange={(e) => setWeight(h, Number(e.target.value) / 100)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="button-row">
        <span>Targets add up to {pct(total)}; the rest stays in cash.</span>
        <span className="toolbar-gap" />
        <button onClick={() => usePrograms.setState({ defrag: { targets: [] } })}>Reset</button>
        <button onClick={schedule} disabled={!holdings.length}>Run Monthly (Trader)</button>
        <button className="default" onClick={analyse} disabled={!holdings.length || phase === 'running'}>
          {phase === 'running' ? 'Defragmenting…' : 'Defragment'}
        </button>
      </div>
      {orders && (
        <Confirm title="Defragment Portfolio" ok="Send Orders" onOk={() => void send()} onCancel={() => setOrders(undefined)}>
          {orders.length ? (
            <>
              <p>These market orders will bring the portfolio to its targets:</p>
              <ul>
                {orders.map((o, k) => (
                  <li key={k}>
                    {o.shares > 0 ? 'Buy' : 'Sell'} {count(Math.abs(o.shares))} {o.fund !== undefined ? FUNDS[o.fund].ticker : tickers[o.company!]}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Your portfolio is already on target. Nothing to defragment.</p>
          )}
        </Confirm>
      )}
    </div>
  );
}
