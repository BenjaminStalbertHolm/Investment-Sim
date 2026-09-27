import { BrowserWindow } from '../browser/Browser';
import type { AppProps } from '../types';
import './garlic.css';

/** The Garlic Browser 0.9 beta (spec §14A): Internet Exploiter's chrome, dark, slow, forgetful, and able to open .garlic addresses. */
export default function Garlic(props: AppProps) {
  return <BrowserWindow {...props} garlic />;
}
