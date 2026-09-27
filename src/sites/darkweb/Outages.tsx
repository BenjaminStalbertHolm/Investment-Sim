import { Logo, companyLogo } from '../../art/logo/Logo';
import { formatDate } from '../../sim/calendar';
import type { Outage } from '../../sim/darkweb';
import { useGame } from '../../state/game';
import { companyOf } from '../hooks';
import { useTitle } from '../web';
import './darkweb.css';

/** A company's web site after the hackers-for-hire have been (spec §14A: a generated defaced page). */
export function Defaced({ company, outage }: { company: number; outage: Outage }) {
  const directory = useGame((s) => s.directory);
  const c = companyOf(directory.genomes[company]);
  useTitle(`HACKED BY ${outage.crew?.toUpperCase() ?? 'SOMEONE'}`);
  return (
    <div className="defaced">
      <h1>0WN3D!!!</h1>
      <div className="defaced-logo">
        <Logo spec={companyLogo(c.genes)} name={c.name} height={48} />
      </div>
      <p>{c.name.toUpperCase()} H4S B33N H4CK3D BY {outage.crew?.toUpperCase() ?? 'US'}</p>
      <p>ur s3cur1ty iz a j0k3. ur st0ck iz n3xt.</p>
      <p>gr33tz 2 all 0ur fr13nds 0n th3 g4rl1c n3tw0rk</p>
      <p>
        <small>The webmaster expects to restore this site by {formatDate(outage.until)}.</small>
      </p>
    </div>
  );
}

/** A competitor's web site under a denial-of-service attack (spec §14A: down for three trading days). */
export function ServerTooBusy({ host, outage }: { host: string; outage: Outage }) {
  useTitle('Server Too Busy');
  return (
    <div className="cannot-display">
      <h1>Server Too Busy</h1>
      <p>
        The server <b>{host}</b> is too busy to handle your request. It is receiving several million requests a second, which is
        several million more than usual.
      </p>
      <p>Please try again after {formatDate(outage.until)}.</p>
      <p className="cannot-display-code">HTTP 503 — Internet Exploiter</p>
    </div>
  );
}
