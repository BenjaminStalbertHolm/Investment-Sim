import { useGame } from '../../state/game';
import { useShell } from '../../state/shell';
import { useWindows } from '../../state/windows';
import { TUCATS } from '../urls';
import { HitCounter, Link, Marquee, useTitle } from '../web';
import '../darkweb/darkweb.css';

/** What Tucats offers: the Garlic Browser now; the optional apps of spec §4A arrive with Phase 10. */
const DOWNLOADS = [
  { id: 'garlic', name: 'Garlic Browser 0.9 beta', size: '1.4 MB', cats: 5, blurb: 'Browse the Garlic network, where addresses end in .garlic. Anonymous, slow, and not for the faint of heart.' },
  { id: 'winramp', name: 'WinRamp 2.0', size: '2.1 MB', cats: 5, blurb: 'It really whips the market. Coming soon.' },
  { id: 'sweeper', name: 'Margin Sweeper', size: '0.3 MB', cats: 4, blurb: 'The mines are companies that went bankrupt. Coming soon.' },
  { id: 'solitear', name: 'Soli-Tear', size: '0.5 MB', cats: 4, blurb: 'Solitaire, with your firm’s logo on every card. Coming soon.' },
];

/**
 * Tucats Downloads (spec §4A, §14A): "the ultimate collection" of Doors software. The Garlic Browser's download page is
 * where the anonymous tip letter points; downloading runs its installer.
 */
export default function Tucats({ url }: { url: URL }) {
  useTitle('Tucats Downloads');
  const darkWeb = useGame((s) => s.settings?.darkWeb ?? true);
  const installed = useShell((s) => s.installed);
  const download = (id: string) => useWindows.getState().open('installer', { view: id });
  const garlicPage = url.pathname === '/garlic.html';
  const shown = garlicPage ? DOWNLOADS.slice(0, 1) : DOWNLOADS;
  return (
    <div className="site-tucats">
      <div className="tucats-header">
        <b>Tucats</b> — The Ultimate Collection of Doors 98 Software
      </div>
      <Marquee>Over 40,000 files! Rated by our expert cats! No viruses (probably)!</Marquee>
      <div className="tucats-body">
        {garlicPage && (
          <p>
            <Link href={`http://${TUCATS}/`}>Tucats</Link> » Internet » Browsers » <b>Garlic Browser</b>
          </p>
        )}
        <table className="tucats-table">
          <thead>
            <tr><th>Program</th><th>Size</th><th>Rating</th><th>Description</th><th /></tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id}>
                <td>{d.id === 'garlic' && !garlicPage ? <Link href={`http://${TUCATS}/garlic.html`}>{d.name}</Link> : <b>{d.name}</b>}</td>
                <td>{d.size}</td>
                <td className="tucats-cats">{'🐱'.repeat(d.cats)}</td>
                <td>
                  {d.id === 'garlic' && !darkWeb ? 'This download has been removed at the request of the Securities Oversight Bureau.' : d.blurb}
                </td>
                <td>
                  {d.id !== 'garlic' ? (
                    <i>Coming soon</i>
                  ) : !darkWeb ? (
                    <i>Removed</i>
                  ) : installed.includes('garlic') ? (
                    <i>Installed</i>
                  ) : (
                    <button onClick={() => download(d.id)}>Download</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {garlicPage && darkWeb && (
          <p>
            <b>Our cats say:</b> “The Garlic Browser routes your connection through three other computers, so nobody can tell where it
            comes from. What you do with it is between you and your conscience. And possibly the SOB.”
          </p>
        )}
        <HitCounter count={1_048_576 + (garlicPage ? 31_337 : 0)} />
      </div>
    </div>
  );
}
