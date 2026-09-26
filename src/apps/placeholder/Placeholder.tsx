import { APPS } from '../catalog';
import { Icon } from '../../art/icons';
import type { AppProps } from '../types';

export default function Placeholder({ appId }: AppProps) {
  const app = APPS[appId];
  return (
    <div className="placeholder">
      <Icon name={app.icon} size={64} />
      <div>
        <p>
          <b>{app.title}</b>
        </p>
        <p>{app.blurb}</p>
        <p>Setup has not finished installing this program. It will be ready in Phase {app.phase}.</p>
      </div>
    </div>
  );
}
