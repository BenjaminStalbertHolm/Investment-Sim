/** Click anywhere to power the computer back on. */
export function ShutdownScreen({ onPowerOn }: { onPowerOn(): void }) {
  return (
    <div className="shutdown-screen" onClick={onPowerOn}>
      <p>It is now safe to turn off your computer.</p>
    </div>
  );
}
