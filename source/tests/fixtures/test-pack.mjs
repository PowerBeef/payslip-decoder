// A made-up collective agreement for the tests, in the same shape as a real agreement pack. Every name, rate and
// rule here is fictional. Its rates are the example payslip's own made-up rates (tools/fake_payslip.mjs), so the
// leak check's comparison with the real pack holds. It opens only for the made-up test employer below; the app
// itself never ships it (tests add it to the page).
export const TEST_COMPANY = 'Usinage Fictif ltée';
export const TEST_ADDRESS = '200, boulevard du Fictif, Lac-Imaginaire, QC J0J 1J1';
// the spellings that open it (see PD.agreementMaterial): as printed, and the city's other name
export const TEST_MATERIALS = ['usinage|lac-imaginaire', 'usinage|ville-imaginaire'];

const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
// 2025 scale; the 2026 scale is 2.75% higher (27.10 becomes 27.85 and 28.68 becomes 29.47, as on the example)
const BASE = { 1: 24.4, 2: 25.75, 3: 27.1, 4: 27.9, 5: 28.68, 6: 30.05 };
const scale = (from, raise, mult) => ({
  from,
  raise,
  rates: Object.fromEntries(Object.entries(BASE).map(([c, v]) => [c, { A: r2(v * mult), B: r2(v * mult + 0.5), C: r2(v * mult + 1) }])),
});

export const TEST_PACK = {
  id: 'test-fictif',
  title: { en: 'Collective agreement (made up for the tests)', fr: 'Convention collective (inventée pour les tests)' },
  union: { en: 'Imaginary Workers Union', fr: 'Syndicat des travailleurs imaginaires' },
  signed: '2025-05-01',
  expires: '2028-04-30',
  scales: [scale('2025-05-04', 2.5, 1), scale('2026-05-03', 2.75, 1.0275)],
  jobs: {
    1: ['Journalier'],
    2: ['Emballeur', 'Commis'],
    3: ['Opérateur'],
    4: ['Opérateur principal'],
    5: ['Mécanicien'],
    6: ['Électricien'],
  },
  shiftPremium: { evening: 1.05, night: 1.25 },
  otherPremiums: [{ amount: 0.6, id: 'lead' }],
  pension: { rate: 0.045, extraAfter10y: 0.01 },
  insuranceEmployerShare: 0.6,
  sickDays: 5,
  mealAllowance: 12,
  bootsAllowance: 150,
  charityRate: 0,
  holidayIds: ['newYear', 'goodFriday', 'easterMonday', 'patriots', 'stJean', 'canada', 'labour', 'thanksgiving', 'christmas', 'boxing'],
  holidays: {
    en: [
      'New Year’s Day',
      'Good Friday',
      'Easter Monday',
      'National Patriots’ Day',
      'Fête nationale',
      'Canada Day',
      'Labour Day',
      'Thanksgiving',
      'Christmas Day',
      'Boxing Day',
    ],
    fr: [
      'Jour de l’An',
      'Vendredi saint',
      'Lundi de Pâques',
      'Journée nationale des patriotes',
      'Fête nationale',
      'Fête du Canada',
      'Fête du Travail',
      'Action de grâce',
      'Noël',
      'Lendemain de Noël',
    ],
  },
  vacation: [
    { svc: { en: 'Under 1 year', fr: 'Moins de 1 an' }, len: { en: '1 day per month', fr: '1 jour par mois' }, pct: 4 },
    { svc: { en: '1 to 4 years', fr: '1 à 4 ans' }, len: { en: '2 weeks', fr: '2 semaines' }, pct: 4 },
    { svc: { en: '5 to 9 years', fr: '5 à 9 ans' }, len: { en: '3 weeks', fr: '3 semaines' }, pct: 6 },
    { svc: { en: '10 years or more', fr: '10 ans ou plus' }, len: { en: '4 weeks', fr: '4 semaines' }, pct: 8 },
  ],
  facts: {
    fr: [
      ['1,05 $ / 1,25 $', 'Prime de soir / de nuit, par heure', 'Convention fictive'],
      ['4,5 % + 4,5 %', 'Retraite : vous et l’employeur versez chacun 4,5 %', 'Convention fictive'],
      ['5 jours', 'Maladie par année', 'Convention fictive'],
    ],
    en: [
      ['$1.05 / $1.25', 'Evening / night shift premium, per hour', 'Made-up agreement'],
      ['4.5% + 4.5%', 'Pension: you and your employer each put in 4.5%', 'Made-up agreement'],
      ['5 days', 'Sick days a year', 'Made-up agreement'],
    ],
  },
  kinds: {
    overtime: { en: 'Paid at 1.5× after 40 hours (made-up rule).', fr: 'Payé à 1,5 × après 40 heures (règle inventée).' },
    evening: {
      en: '$1.05 extra per hour on the evening shift (made-up rule).',
      fr: '1,05 $ de plus l’heure au quart de soir (règle inventée).',
    },
    night: {
      en: '$1.25 extra per hour on the night shift (made-up rule).',
      fr: '1,25 $ de plus l’heure au quart de nuit (règle inventée).',
    },
    holiday: { en: 'Statutory holiday paid at your rate (made-up rule).', fr: 'Congé férié payé à votre taux (règle inventée).' },
    vacation: {
      en: 'Vacation paid as a percentage of last year’s gross (made-up rule).',
      fr: 'Vacances payées selon un pourcentage du brut de l’an dernier (règle inventée).',
    },
    sick: { en: '5 paid sick days a year (made-up rule).', fr: '5 jours de maladie payés par année (règle inventée).' },
    pension: {
      en: '4.5% of regular-time pay into the pension plan (made-up rule).',
      fr: '4,5 % du salaire régulier versé au régime de retraite (règle inventée).',
    },
    union: { en: 'Union dues, taken every pay (made-up rule).', fr: 'Cotisation syndicale retenue à chaque paie (règle inventée).' },
    life: { en: 'Your share of the group insurance (made-up rule).', fr: 'Votre part de l’assurance collective (règle inventée).' },
    medDent: {
      en: 'Your share of the medical and dental plan (made-up rule).',
      fr: 'Votre part du régime médicaments et dentaire (règle inventée).',
    },
    erPension: { en: 'Your employer’s matching 4.5% (made-up rule).', fr: 'Les 4,5 % versés par l’employeur (règle inventée).' },
    charity: {
      name: { en: 'Works fund', fr: 'Caisse des œuvres' },
      en: 'A donation taken every pay (made-up rule).',
      fr: 'Un don retenu à chaque paie (règle inventée).',
    },
  },
  // the workplace's own payslip spellings (made up): line kinds and the assistant's words for them
  labels: { earn: [['^hres\\s*ord', 'regular']] },
  askWords: [['regular', ['hres ord']]],
  glossary: [
    [
      'Code (01, 210)',
      'The department and cost centre the hours were charged to (made-up).',
      'Le service et le centre de coûts où les heures sont imputées (inventé).',
    ],
  ],
  text: {
    en: {
      codesIntro: 'The two numbers in brackets after a line name the department and the cost centre (made-up explanation).',
      intro: '{title}, {union}.',
      expires: 'This made-up agreement expires on {date}.',
      vacNote: 'The vacation balance is in dollars (made-up rule).',
      rateMiss: 'No rate on the {from} scale matches (made-up agreement).',
      rateHit: 'On the {from} scale (+{raise}%).',
      rateHigher: ' Higher than your main rate ({main}), probably a premium or another job.',
      shiftOk: 'Evening {ev}, night {ni} (made-up agreement).',
      shiftBad: 'Expected evening {ev} or night {ni}.',
      premHours: 'The premium is paid on the hours worked on that shift.',
      otRule: ' (made-up rule)',
      pension: '4.5% of {base} = {exp} (made-up rule).',
      charity: '',
      charityTitle: '',
      sick: '{h} hours used; {days} days ({hours} hours) a year.',
      sickLeft: '{days} days ({hours} hours) left.',
      shiftRef: '',
      insHigher: '{rate} is above class {cls} level {lv}.',
      holidaysRef: '',
      vacRef: '',
    },
    fr: {
      codesIntro: 'Les deux nombres entre parenthèses après une ligne indiquent le service et le centre de coûts (explication inventée).',
      intro: '{title}, {union}.',
      expires: 'Cette convention inventée expire le {date}.',
      vacNote: 'Le solde de vacances est en dollars (règle inventée).',
      rateMiss: 'Aucun taux de l’échelle du {from} ne correspond (convention inventée).',
      rateHit: 'Échelle du {from} (+{raise} %).',
      rateHigher: ' Plus élevé que votre taux principal ({main}) : sans doute une prime ou un autre poste.',
      shiftOk: 'Soir {ev}, nuit {ni} (convention inventée).',
      shiftBad: 'Attendu : soir {ev} ou nuit {ni}.',
      premHours: 'La prime est versée sur les heures travaillées à ce quart.',
      otRule: ' (règle inventée)',
      pension: '4,5 % de {base} = {exp} (règle inventée).',
      charity: '',
      charityTitle: '',
      sick: '{h} heures utilisées; {days} jours ({hours} heures) par année.',
      sickLeft: 'Il reste {days} jours ({hours} heures).',
      shiftRef: '',
      insHigher: '{rate} dépasse la classe {cls}, niveau {lv}.',
      holidaysRef: '',
      vacRef: '',
    },
  },
};
