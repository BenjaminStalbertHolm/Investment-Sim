import { TensionList } from '../../apps/encarter/TensionList';
import { hash } from '../../sim/press';
import { useGame } from '../../state/game';
import { useModules } from '../hooks';

const SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const UP = [
  'Jupiter smiles on your portfolio. Buy the thing you have been thinking about.',
  'A tall stranger will offer you a tip. For once, it is a good one.',
  'The stars favour bold moves. So does the market, this week.',
  'Venus is in the house of dividends. Expect a pleasant surprise.',
  'Something green is coming your way. It may be money.',
  'Your lucky number is up. So is the market.',
  'A bull crosses your path on Tuesday. Do not step aside.',
  'The planets align behind your largest holding. Hold on.',
  'Your moon is in the house of upgrades. Analysts will agree with you.',
  'An old friend calls with good news about an old stock.',
  'The sun rises on your sector. Wear sunglasses.',
  'Luck favours the fully invested this week. Keep your cash working.',
];
const DOWN = [
  'Mercury is in retrograde. Do not sign anything. Especially not a margin agreement.',
  'Saturn advises caution. Cash is a position, too.',
  'A dark cloud hangs over your holdings. Carry an umbrella and a stop-loss.',
  'The moon is in the house of short sellers. Be afraid.',
  'Avoid anything with a ticker that starts with a vowel. Avoid everything, really.',
  'Mars says: sell in haste, repent at leisure. Mars is often wrong.',
  'A bear lurks in your seventh house. Lock the door.',
  'An eclipse falls on your portfolio. Do not look directly at it.',
  'Beware of tips from strangers in elevators this week.',
  'Pluto is leaving your house of gains, and taking some with it.',
  'The stars say rest. The market says so too. Listen to both.',
  'Your ruling planet is having a bad week. So will you.',
];

/**
 * The Daily Scoop's stock horoscope and the hemline index (spec §16C.3): every sign says the same thing, dressed up
 * differently, and they are right a little more often than not.
 */
export function Horoscope() {
  const gags = useModules()?.gags;
  const seed = useGame((s) => s.seed);
  if (!gags) return null;
  // A different line for every sign, shuffled afresh each week.
  const week = [...(gags.horoscope.sign > 0 ? UP : DOWN)].sort((a, b) => hash(seed, gags.horoscope.week, a) - hash(seed, gags.horoscope.week, b));
  return (
    <div className="scoop-horoscope">
      <b>★ YOUR STOCK HOROSCOPE ★</b>
      <ul>
        {SIGNS.map((sign, k) => (
          <li key={sign}>
            <b>{sign.toUpperCase()}:</b> {week[k]}
          </li>
        ))}
      </ul>
      <p>
        <b>THE HEMLINE INDEX:</b> hemlines are {gags.hemline.sign > 0 ? 'UP' : 'DOWN'} this month. Our fashion desk says stocks will follow.
        They usually do, a bit.
      </p>
    </div>
  );
}

/** A small tension meter on the news sites for the pairs at odds (spec §16C.1), while the Geopolitics module is on. */
export function TensionMeter() {
  const tensions = useModules()?.geo?.tensions;
  if (!tensions?.length) return null;
  return (
    <div className="tension-meter">
      <b>World Tension Meter</b>
      <TensionList tensions={tensions} />
    </div>
  );
}
