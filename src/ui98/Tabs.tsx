/** 98.css tabs: a tab strip; the panel is the caller's. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly (readonly [T, string])[]; value: T; onChange(tab: T): void }) {
  return (
    <menu role="tablist">
      {tabs.map(([id, label]) => (
        <li key={id} role="tab" aria-selected={value === id}>
          <a
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              onChange(id);
            }}
          >
            {label}
          </a>
        </li>
      ))}
    </menu>
  );
}
