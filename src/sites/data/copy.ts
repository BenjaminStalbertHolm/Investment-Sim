// Text templates for generated websites (spec §14). Placeholders in braces are filled from the company:
// {name} {short} {industry} {sub} {kind} {kinds} {city} {country} {year} {ceo} {first} {last} {age} {product}.
// Pages are rebuilt from these every time, so they can be changed freely.

const p = (s: string) => s.split('|');

export const SLOGANS = p(
  'Quality {kinds} since {year}!|The {industry} people.|Your partner in {kinds}.|Building a better {kind} since {year}.|' +
    '{short}: we mean business.|Proudly serving {city} since {year}.|The name you trust in {industry}.|' +
    'Tomorrow’s {kinds}, today!|Nobody does {kinds} like {short}.|Think {short}. Think quality.|' +
    'Ready for the year 2000!|A world leader in {sub}.|Bringing {kinds} to the world.|{short} — the smart choice.|' +
    'Excellence in {sub}.|Where {kinds} come alive!|Now on the World Wide Web!|The {kind} experts.',
);

export const WELCOME = p(
  'Welcome to the official home page of {name}! We are a leading provider of {kinds} based in {city}, {country}.|' +
    'Thank you for visiting {name} on the World Wide Web. Since {year}, we have been proud to serve customers in {sub}.|' +
    'Greetings, and welcome to {short} Online! Use the buttons to find out about our {kinds}, our history and our investors.|' +
    'Welcome! {name} has been a name in {industry} for over {years} years. This site is best viewed with Internet Exploiter 4.0.',
);

export const HISTORY = p(
  '{name} was founded in {year} in {city}, {country}.|' +
    '{short} began in {year} as a small {subLower} business in {city} with a handful of employees and one big idea.|' +
    'Founded in {year}, {short} grew from a single office in {city} into a household name in {industry}.',
);

export const MILESTONES = p(
  'opened its first office outside {country}|launched its famous {product}|listed its shares on the exchange|' +
    'survived a hostile takeover attempt|moved into its current headquarters in {city}|celebrated its millionth customer|' +
    'won the {industry} Excellence Award|introduced the {product}|opened a new plant|launched its first web site',
);

export const BIO_START = p(
  '{ceo}, {age}, has led {short} as Chief Executive Officer since {since}.|' +
    '{ceo} ({age}) became Chief Executive Officer of {short} in {since}.|' +
    'Chief Executive Officer {ceo} joined {short} in {since} and has run the company ever since.',
);

export const BIO_MIDDLE = p(
  'Before joining {short}, {first} spent {n} years at a rival {subLower} firm.|' +
    '{first} holds an MBA from {school} and a degree in engineering.|' +
    '{first} began a career at {short} in the mailroom and rose through the ranks.|' +
    'A graduate of {school}, {first} previously worked as a management consultant.|' +
    '{first} was named “{industry} Executive of the Year” by a leading trade magazine.',
);

export const BIO_END = p(
  'Outside the office, {first} enjoys golf, sailing and collecting stamps.|' +
    '{first} lives in {city} and serves on the board of the local symphony.|' +
    'In {their} spare time, {first} coaches a youth soccer team.|' +
    '{first} is a keen amateur astronomer and chess player.|' +
    '{first} has run the {city} marathon eleven times.',
);

export const SCHOOLS = p(
  'Harbard University|Stamford University|the Massachusetts Institute of Technicality|Yail University|the London School of Economix|' +
    'Oxbridge University|the Wharton-on-Hudson School|Colombia University|INSEAB|the University of Chicagoland|' +
    'Princetown University|Cornel University|the Sorbonnet|McGrill University|Kyoto Imperial University',
);

export const PRODUCT_BLURBS = p(
  'The {product} is the most advanced {kindLower} on the market.|Customers love the {product} — now in six colours!|' +
    'New and improved! The {product} is ready for the year 2000.|Order the {product} today and save 10%.|' +
    'The {product}: trusted by professionals everywhere.|Award-winning {kindLower} for the whole family.|' +
    'Built to last. Priced to sell. That’s the {product}.|Ask your dealer about the {product}.',
);

/** Guestbook entries by what they say about the company: praise, complaints, and neither. */
export const GUESTBOOK = {
  good: p(
    'Great company!!! I bought the {product} and it works perfectly.|Cool web site! Keep up the good work :-)|' +
      'I have owned {short} shares since 1989 and never regretted it.|My dad works at {short}. Best company in {city}!|' +
      'The {product} changed my life. Thank you {short}!|Excellent customer service. They called back the same day.|' +
      'Solid management. {ceo} knows what they are doing.|Just bought more shares. This one is going places!!!',
  ),
  bad: p(
    'My {product} broke after two weeks. STILL waiting for a refund!!!|Worst customer service EVER. Nobody answers the phone.|' +
      'Why did the stock go down again?? Someone explain.|I heard the accountants are cooking the books. Just saying.|' +
      'Sold all my shares. Management has no idea what they are doing.|The {product} is a rip-off. Do not buy.|' +
      'Their earnings are a mystery to me. Buyer beware.|Called three times about my order. Put on hold for an hour.',
  ),
  neutral: p(
    'Hi from {guestCity}! Found your page through Yeehaw!|Does anyone know when the next dividend is paid?|' +
      'Nice page. Please visit my home page too!|Hello to everyone in the {industry} Web Ring!|' +
      'Is the {product} available in Canada?|First time here. What does {short} actually do?|' +
      'Please add more pictures of the {product}.|Greetings from the internet café!',
  ),
};

export const STRATEGY_BLURBS: Record<string, string> = {
  index: 'We believe in owning the whole market at the lowest possible cost. Our index funds hold every major company in proportion to its size, so our clients never lag the market — and never beat it.',
  balanced: 'A balanced mix of blue-chip stocks, chosen with a century of experience, for clients who want growth without sleepless nights.',
  momentum: 'Our traders follow the trend. When a stock is moving, we are already on board — and when it turns, we are already gone.',
  growth: 'We invest in tomorrow’s leaders today: fast-growing companies with big markets and bigger ambitions.',
  value: 'We buy good companies when nobody else wants them, and we wait. Patience is our edge.',
  stockPicking: 'Our analysts visit hundreds of companies every year to find the few worth owning. Research, research, research.',
  quant: 'Our computers analyse millions of numbers every second to find patterns the human eye cannot see. Our models are proprietary.',
  macro: 'We study interest rates, currencies and commodities to position our clients for the big turns in the world economy.',
  activist: 'We buy significant stakes in underperforming companies and work with — or against — their boards to unlock value.',
};
