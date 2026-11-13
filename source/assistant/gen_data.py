"""Generates training questions for the assistant's question model.

Each question type (intent) has French (standard and Québec everyday speech) and English sentence frames.
Frames are filled with the names people use for payslip lines and payroll terms, then varied with
polite openers, endings and typos. Nothing here is specific to an employer or a collective agreement:
those answers come from the encrypted pack at run time.

    python3 gen_data.py > train.tsv     (intent<TAB>question)
"""
import random
import sys

R = random.Random(20261113)

# names people use for payslip lines and payroll terms (any line can follow any frame)
LINES_FR = ['rrq', 'le rrq', 'régime de rentes', 'rentes du québec', "l'ae", 'assurance-emploi', 'assurance emploi', 'le chômage',
            'rqap', "l'assurance parentale", 'impôt fédéral', "l'impôt du québec", 'impôt provincial', 'irf', 'irp',
            'cotisation syndicale', 'le syndicat', 'les cotisations syndicales', 'régime de retraite', 'fonds de pension', 'ma pension',
            'assurance collective', 'ass. groupe', 'assurance médicaments', 'le dentaire', 'fonds humanitaire', 'fonds de solidarité ftq',
            'reer', 'prime de soir', 'prime de nuit', 'la prime de quart', 'temps supplémentaire', 'temps supp', 'temps et demi', 'temps double',
            'heures régulières', 'hrs reg', 'le férié', 'congé férié', 'paie de vacances', 'les vacances', 'maladie', 'congé de maladie', 'deuil',
            'rétro', 'la rétroactivité', 'prix de service', 'rrq2', 'la part de l’employeur', 'bq de vac payé', 'divers tx']
LINES_EN = ['qpp', 'the qpp', 'pension plan', 'ei', 'employment insurance', 'qpip', 'parental insurance', 'federal tax', 'quebec tax',
            'provincial tax', 'income tax', 'union dues', 'the union', 'my pension', 'pension plan contribution', 'group insurance', 'life insurance',
            'dental', 'medical insurance', 'humanity fund', 'ftq fund', 'rrsp', 'evening premium', 'night premium', 'shift premium', 'overtime',
            'time and a half', 'double time', 'regular hours', 'holiday pay', 'stat holiday', 'vacation pay', 'sick pay', 'sick leave',
            'bereavement', 'retro pay', 'back pay', 'service award', 'qpp2', 'employer contribution']
TERMS_FR = ['td1', 'tp-1015.3', 'le t4', 'le relevé 1', 'rl-1', 'brut', 'le net', 'cumul annuel', 'salaires assujettis', 'salaires imposables',
            'worktag', 'kronos', 'virement bancaire', "banque d'heures", 'montant total de la demande', 'retenues avant impôt', 'avantage imposable',
            'le code (00, 123)', 'les codes entre parenthèses', 'ee / er', 'prov tb']
TERMS_EN = ['td1', 'the t4', 'rl-1', 'gross pay', 'net pay', 'year to date', 'ytd', 'taxable wages', 'pensionable earnings', 'insurable earnings',
            'worktag', 'bank transfer', 'banked hours', 'pre-tax deductions', 'taxable benefit', 'ee and er', 'claim amount']
HOLIDAYS_FR = ['noël', 'le jour de l’an', 'la fête nationale', 'la saint-jean', 'la fête du travail', "l'action de grâce", 'pâques',
               'le vendredi saint', 'la fête du canada', 'le 24 juin', 'le 1er juillet', 'les fêtes', 'le lendemain de noël', 'la journée des patriotes']
HOLIDAYS_EN = ['christmas', 'new year', 'labour day', 'thanksgiving', 'easter', 'good friday', 'easter monday', 'canada day', 'boxing day', 'st-jean',
               'the holidays', 'victoria day', 'patriots day', 'new year’s eve', 'christmas eve']

OPEN_FR = ['', '', '', '', 'bonjour ', 'salut ', 'allo ', 'svp ', 'dis-moi ', 'peux-tu me dire ', "j'aimerais savoir ", 'question : ', 'hey ', 'est-ce que tu peux me dire ']
END_FR = ['', '', '', '', ' ?', '?', ' svp', ' stp', ' merci', ' cette semaine', ' sur mon talon', ' sur ma paie', ' sur ma paye', ' cette paie']
OPEN_EN = ['', '', '', '', 'hi ', 'hey ', 'please ', 'can you tell me ', 'quick question: ', 'i want to know ', 'tell me ']
END_EN = ['', '', '', '', '?', ' ?', ' please', ' thanks', ' this week', ' on my payslip', ' on this pay', ' this pay']

F = {}  # intent -> (fr frames, en frames)
F['net'] = ([
    'combien au final', "j'ai eu combien au bout du compte", 'il me reste combien une fois tout enlevé', 'ce qui me reste à la fin', 'mon chèque final', 'combien de cash je reçois',
    'combien j’ai reçu', 'combien je vais recevoir', 'ma paie nette', "c'est quoi ma paie nette", 'combien de net', 'mon net',
    'combien il me reste après les déductions', 'combien je fais net', 'combien ma paye cette semaine', 'ma paye nette est de combien',
    'combien j’ai eu dans mon compte', "combien d'argent je reçois", 'chu payé combien', 'combien rentre dans mon compte',
    'combien je touche', 'montant déposé', 'le montant net', 'combien ils me donnent', 'combien j’ai eu de paye',
    'combien j’ai reçu cette semaine', 'j’ai reçu combien', 'combien j’ai fait cette semaine', 'j’ai fait combien', 'combien on m’a payé',
    'combien m’a rapporté ma semaine', 'ma paie de cette semaine', 'combien je reçois', 'combien d’argent j’ai eu',
    "c'est combien ma paie", 'ma paie est de combien', 'combien vaut ma paie', 'quel est mon salaire net', 'mon salaire net',
], [
    'what is the final amount', 'what do i end up with', "what's left after everything", 'final pay amount', 'how much cash do i get',
    'how much did i get', 'what is my net pay', 'how much did i take home', 'how much did i make this week', 'how much did i receive', 'what did i make', 'take home pay', 'net pay', 'how much was deposited',
    'how much money did i get', 'what did i get paid', 'how much is my paycheck', 'what is my paycheck', 'my net',
    'how much do i get after deductions', 'how much hits my bank', 'how much went into my account', 'how much was put in my bank', 'what got deposited in my account', 'what am i getting this week', 'how much is my pay',
])
F['gross'] = ([
    'total brut', 'le brut total', 'montant brut', 'combien en tout avant les déductions',
    'mon brut', 'ma paie brute', 'combien de brut', 'salaire brut', "c'est quoi mon brut", 'combien avant les déductions',
    'combien j’ai gagné avant impôt', 'mon salaire avant les retenues', 'combien je gagne brut', 'combien j’ai fait brut',
    'total des gains', 'combien j’ai gagné cette semaine', 'mes gains totaux', 'brut cette semaine', 'combien avant taxes',
], [
    'gross total', 'total gross amount', 'everything before deductions',
    'gross pay', 'what is my gross', 'how much did i earn before taxes', 'my gross', 'total earnings', 'how much before deductions',
    'how much did i make', 'how much did i earn', 'what did i earn this week', 'pay before tax', 'my salary before deductions',
])
F['withheld'] = ([
    'total enlevé', 'combien a été enlevé au total', 'la somme des retenues',
    'combien on m’a enlevé', 'combien de déductions', 'total des retenues', 'combien ils m’ont pris', 'combien de retenues',
    'combien j’ai payé en déductions', 'le total des déductions', "combien d'argent ils gardent", 'combien me coûte les retenues',
    'combien y m’ont enlevé', 'total retenu', 'combien est retenu sur ma paie',
], [
    'how much came off', 'total taken off', 'sum of deductions',
    'how much was taken off', 'total deductions', 'how much did they take', 'how much was withheld', 'what are my total deductions',
    'how much do i lose to deductions', 'total withheld', 'how much comes off my pay',
])
F['breakdown'] = ([
    'pourquoi ma paie est si basse', 'où va mon argent', 'explique ma paie', 'explique-moi mon talon', 'pourquoi mon net est plus bas que mon brut',
    'pourquoi je reçois si peu', 'comment on arrive à mon net', 'détaille ma paie', 'décortique ma paie', 'où est passé mon argent',
    "pourquoi c'est moins que prévu", 'comment ma paie est calculée', 'résume mon talon', 'explique-moi tout', 'fais-moi un résumé',
    'pourquoi y a autant de déductions', 'ma paie est trop basse pourquoi', 'je comprends pas ma paie',
    'pourquoi j’ai juste {M} piasses', 'pourquoi seulement {M} $', 'comment ça se fait que j’ai eu juste {M}',
], [
    'why is my pay so low', 'where did my money go', 'where does my money go', 'where does my pay go', 'explain my payslip', 'break down my pay', 'why is net so much lower than gross',
    'how is my pay calculated', 'summarize my payslip', 'explain everything', 'why do i get so little', 'walk me through my pay',
    'i do not understand my paycheck', 'give me a summary',
])
F['deposit'] = ([
    'quand je suis payé', 'quand la paie rentre', 'dans quel compte', 'à quelle banque', 'date de paie', 'quand est le dépôt',
    "c'est déposé où", 'quel jour je reçois ma paie', 'la paie arrive quand', 'quand l’argent rentre', 'quelle date de paiement',
], [
    'when do i get paid', 'when is payday', 'which account', 'which bank', 'pay date', 'when is the deposit', 'where is it deposited',
    'what day does my pay come in', 'when does the money arrive',
])
F['period'] = ([
    'quelle période', 'période de paie', 'de quelle date à quelle date', 'ça couvre quels jours', 'quelle semaine ça couvre',
    'la paie est pour quelle semaine', 'je suis payé aux deux semaines', 'fréquence de paie', 'quelle semaine de travail',
], [
    'what period', 'pay period', 'which dates does this cover', 'which week is this for', 'how often am i paid', 'pay frequency',
    'what week is this pay for',
])
F['line_amount'] = ([
    'combien de {L}', 'combien {L}', "c'est combien {L}", 'combien j’ai payé de {L}', 'combien pour {L}', 'montant de {L}',
    'combien coûte {L}', 'combien ils m’ont pris pour {L}', '{L} combien', 'j’ai payé combien de {L}', 'combien j’ai eu de {L}',
    'combien on m’enlève pour {L}', 'combien j’ai reçu de {L}', 'combien me rapporte {L}', 'le montant {L}', 'combien vaut {L} sur ma paie',
], [
    'how much {L}', 'how much did i pay for {L}', 'how much is {L}', 'amount of {L}', 'what did {L} cost me', '{L} amount',
    'how much {L} did i get', 'how much was {L}', 'how much did they take for {L}', 'how much {L} this week',
], 'L')
F['explain'] = ([
    "c'est quoi {L}", "c'est quoi {T}", 'ça veut dire quoi {L}', 'ça veut dire quoi {T}', 'explique {L}', 'explique-moi {T}',
    'à quoi sert {L}', 'pourquoi je paie {L}', "qu'est-ce que {T}", "qu'est-ce que {L}", 'définition de {T}', 'que signifie {T}',
    'que veut dire {L}', '{T} ça sert à quoi', '{L} c’est quoi', 'pourquoi y a {L} sur mon talon', 'c’est quoi la ligne {L}',
], [
    'what is {L}', 'what is {T}', 'what does {T} mean', 'what does {L} mean', 'explain {L}', 'explain {T}', 'why do i pay {L}',
    'what is {T} for', 'meaning of {T}', 'define {T}', 'what is the {L} line', 'why is there {L} on my payslip',
], 'LT')
F['taxes_total'] = ([
    'le gouvernement me prend combien', 'combien les gouvernements prennent', 'combien va en impôts au total',
    "combien d'impôt", "combien j'ai payé d'impôt", 'total des impôts', 'impôts cette semaine', "combien d'impôt au total",
    "combien je paie d'impôt", 'mes impôts', 'combien de taxes', 'combien va au gouvernement', 'total impôt fédéral et provincial',
], [
    'how much does the government take', 'total income tax', 'government takes how much',
    'how much tax', 'how much tax did i pay', 'total taxes', 'my taxes', 'how much goes to the government', 'how much income tax in total',
])
F['tax_rate'] = ([
    "quel pourcentage d'impôt", "mon taux d'imposition", 'je suis imposé à combien', 'quel taux de taxation', 'pourcentage de déductions',
    'quelle part de ma paie va en impôt', 'je paie quel pourcentage', 'mon taux marginal', 'quel % est retenu', 'quel pourcentage de mon brut est retenu',
    'combien de pourcent part en impôts', 'la proportion d’impôt sur ma paie',
], [
    'what percent is tax', 'my tax rate', 'what is my tax bracket', 'what percentage goes to tax', 'what percent do i lose', 'marginal rate',
    'what share goes to taxes', 'what portion of my pay is taxed', 'what percent of my gross is taken', 'how much percent is withheld',
])
F['hours'] = ([
    "combien d'heures", "combien d'heures payées", 'mes heures', "j'ai fait combien d'heures", "nombre d'heures", 'heures cette semaine',
    "combien d'heures de {H2}", "combien d'heures j'ai travaillé", 'heures payées', 'total des heures', "chu payé pour combien d'heures",
], [
    'how many hours', 'hours paid', 'my hours', 'how many hours did i work', 'total hours', 'hours this week', 'how many {H2} hours',
    'how many hours was i paid for',
])
F['rate'] = ([
    'mon taux est-il bon', 'suis-je dans la bonne classe', 'suis-je payé au bon taux', 'mon taux de la convention', 'je suis à quel échelon',
    'mon taux horaire', 'je fais combien de l’heure', 'combien je gagne de l’heure', 'mon salaire horaire', 'ma classe', 'mon niveau',
    'quelle classe je suis', 'je suis à quel niveau', 'mon taux est-il correct', 'mon taux', 'combien je suis payé de l’heure',
    "c'est quoi mon échelon", 'je suis payé au bon taux', 'quel est mon taux de base',
], [
    'am i paid the right rate', 'am i in the right class', 'is my hourly rate right', 'what step am i on',
    'my hourly rate', 'how much do i make an hour', 'what is my wage', 'my class', 'my level', 'what class am i', 'is my rate right',
    'base rate', 'what am i paid per hour', 'hourly wage',
])
F['per_hour'] = ([
    'combien je fais net de l’heure', 'net à l’heure', 'combien il me reste par heure', 'moyenne à l’heure', 'combien je gagne vraiment de l’heure',
    'mon vrai taux horaire', 'après impôt combien de l’heure', 'combien de l’heure en poche', 'combien je fais de l’heure en net', 'de l’heure après tout', 'combien je fais de l’heure après les déductions',
    'de l’heure une fois les retenues enlevées', 'mon taux horaire net', 'combien je garde par heure travaillée',
], [
    'take home per hour', 'net per hour', 'how much do i really make per hour', 'average per hour', 'after tax per hour',
    'hourly after deductions', 'what i keep per hour', 'my net hourly rate',
])
F['sick_left'] = ([
    'combien de maladie il me reste', 'mes jours de maladie', 'il me reste combien de congés de maladie', 'banque de maladie',
    'combien de journées maladie', "j'ai encore des maladies", 'mes congés maladie disponibles', 'combien de jours malade je peux prendre',
    'y me reste-tu des maladies', 'solde maladie', 'heures de maladie restantes', 'pourquoi ma maladie est négative', 'maladie négative',
    'mes maladies', "j'ai droit à combien de maladie encore",
], [
    'how many sick days left', 'sick days remaining', 'my sick bank', 'how much sick time do i have', 'sick leave balance',
    'can i still take a sick day', 'why is my sick balance negative', 'sick hours left',
])
F['bank_left'] = ([
    "ma banque d'heures", "combien d'heures en banque", "j'ai combien dans ma banque", 'temps supplémentaire en banque',
    'heures accumulées', 'combien de temps en banque', 'solde banque de temps', "banque d'heures supp",
], [
    'banked hours', 'how many hours in my bank', 'my time bank', 'overtime bank', 'banked overtime balance', 'time owed to me',
])
F['vacation_left'] = ([
    'combien de vacances il me reste', 'mes vacances restantes', 'solde de vacances', "j'ai encore des vacances", 'banque de vacances',
    'combien de jours de vacances je peux prendre', 'mes vacances accumulées', 'combien de paie de vacances il reste',
    'il me reste-tu des vacances', 'vacances disponibles',
], [
    'how much vacation left', 'vacation balance', 'vacation days remaining', 'do i have vacation left', 'accrued vacation',
    'how much vacation pay is left',
])
F['ytd'] = ([
    "depuis le début de l'année", 'cumul annuel', "combien j'ai gagné cette année", 'total de l’année', "combien d'impôt cette année",
    'mon brut annuel', 'mon net depuis janvier', 'combien depuis janvier', 'cette année au total', 'à date cette année',
    "combien de {L} depuis le début de l'année", '{L} cumulé', 'cumul de {L}', 'revenu à date', 'mon revenu cumulatif', 'mes gains à date',
    'total annuel jusqu’à maintenant',
], [
    'year to date', 'how much this year', 'total so far this year', 'ytd gross', 'since january', 'how much tax this year',
    'how much {L} this year', '{L} year to date', 'annual total so far',
], 'L?')
F['maximums'] = ([
    "pourquoi ma paie monte à la fin de l'année", 'ma paie augmente en fin d’année pourquoi', 'quand le rrq va arrêter', 'quand je vais avoir payé assez d’ae',
    "quand j'arrête de payer l'ae", "quand j'arrête de payer le rrq", 'maximum annuel', 'est-ce que je vais atteindre le maximum',
    'quand je vais avoir fini de payer {L}', 'plafond de {L}', 'le maximum du rrq', "j'ai-tu atteint le maximum", 'quand ma paie va augmenter en fin d’année',
    'pourquoi ma paie augmente en décembre', 'maximum assurance-emploi', 'cotisation maximale',
], [
    'why does my pay go up at the end of the year', 'when will i stop paying into ei', 'when does the qpp stop',
    'when do i stop paying ei', 'when do i stop paying qpp', 'annual maximum', 'will i hit the max', 'when will {L} stop', '{L} maximum',
    'have i reached the maximum', 'why does my pay go up in december', 'maximum contribution', 'did i max out {L}', 'am i maxed out on {L}',
    'is {L} maxed out', 'have i hit the {L} cap', 'when will i max out',
], 'L?')
F['slips'] = ([
    'montant de la case {N}', 'case {N} combien', 'mon t4 va dire quoi', 'ce que je vais déclarer',
    'mon t4', 'mon relevé 1', 'case 14', 'quels montants sur mon t4', "qu'est-ce qui va aller sur mon rl-1", 'feuillets fiscaux',
    'pour mes impôts', 'case {N} du t4', 'code {N} relevé 1', 'mes feuillets', 'montant pour ma déclaration de revenus',
], [
    'box {N} amount', 'what is in box {N}', 'what will i report on my taxes',
    'my t4', 'my rl-1', 'box 14', 'what goes on my t4', 'tax slips', 'for my tax return', 'box {N} on the t4', 'what will my t4 say',
])
F['employer'] = ([
    "combien l'employeur paie", "la part de l'employeur", "ce que l'employeur met", "l'employeur contribue combien",
    'cotisations de l’employeur', 'avantages payés par la compagnie', 'combien la compagnie paie pour moi',
    'la part employeur de la pension', 'la part employeur du régime de retraite', 'combien l’employeur met dans ma pension', 'la part patronale',
    'ce que la compagnie paie en assurances', 'cotisation patronale',
], [
    'how much does my employer pay', 'employer contributions', 'what does the company pay for me', 'employer share', 'employer match',
    'employer share of my pension', 'how much does the company put in my pension', 'what the employer pays for insurance',
])
F['checks'] = ([
    'la paie s’est-tu trompée', 'erreur de la paie', 'ils m’ont-tu bien payé', 'est-ce que je suis bien payé', 'y a-tu un problème avec ma paye',
    'est-ce que ma paie est correcte', 'y a-t-il des erreurs', 'ma paie est-elle bonne', 'vérifie ma paie', 'est-ce que tout balance',
    'ils se sont-tu trompés', 'y a-tu une erreur', 'est-ce que je me suis fait voler', 'ma paie est-tu correcte', 'tout est beau sur mon talon',
    'des problèmes sur ma paie', 'les vérifications', 'est-ce que les calculs sont bons', 'est-ce qu’il y a une erreur sur mon talon',
    'une erreur dans ma paie', 'ma paie a-tu été bien faite', 'c’est-tu le bon montant', 'je pense qu’il y a une erreur', 'mon talon est-il exact',
], [
    'did payroll mess up', 'did they pay me right', 'was there an error', 'am i paid correctly', 'is something wrong with my pay',
    'is my pay correct', 'are there any errors', 'check my pay', 'is everything right', 'did they make a mistake', 'any problems with my payslip',
    'was i underpaid', 'do the numbers add up', 'is there a mistake on my payslip', 'was my pay calculated right', 'is this the right amount',
    'i think there is an error', 'is my payslip accurate', 'mistake on my pay',
])
F['retro'] = ([
    'pourquoi il y a de la rétro', 'rétro sur mon talon', 'montant rétroactif pourquoi',
    'rétroactivité', "j'ai eu de la rétro", 'paie rétroactive', "c'est quoi la rétro", 'montant rétroactif', 'rappel de salaire',
    'pourquoi j’ai un montant rétro', 'la rétro est pour quoi',
], [
    'why is there back pay', 'back pay on my stub', 'retro on my payslip',
    'retro pay', 'back pay', 'retroactive pay', 'why do i have retro', 'what is the retro amount',
])
F['compare'] = ([
    'pourquoi mon net est plus haut cette semaine', "pourquoi j'ai plus cette semaine", 'pourquoi ma paie est plus grosse', 'pourquoi j’ai moins cette fois', 'ma paie a changé pourquoi',
    "qu'est-ce qui a changé", 'pourquoi ma paie est différente de la semaine passée', 'compare mes talons', 'compare avec la dernière paie',
    'pourquoi j’ai moins que la semaine dernière', 'pourquoi plus que la dernière fois', 'différence entre mes deux paies',
    'pourquoi ma paie a baissé', 'pourquoi ma paie a monté', 'pourquoi {L} est plus haut que la semaine passée',
    'pourquoi {L} a changé', 'compare les deux', 'c’est quoi la différence', 'comparaison avec la paie précédente',
    'pourquoi j’ai moins cette semaine', 'pourquoi ma paie est plus basse que d’habitude', 'pourquoi j’ai eu moins que la dernière paie',
], [
    'why is my net higher this week', 'why did my net go up', 'why is my pay bigger', 'why less this time', 'my pay changed why', 'why did my paycheck change',
    'what changed', 'why is my pay different from last week', 'compare my payslips', 'compare with last pay', 'compare this pay with the last one', 'compare with my previous payslip',
    'how does this pay compare to last week', 'difference between this payslip and the previous', 'what changed compared to my last pay', 'why did i get less than last week',
    'why more than last time', 'difference between my two pays', 'why did my pay drop', 'why is {L} higher than last week',
    'why did {L} change', 'compare the two', 'why is this pay lower than usual',
], 'L?')
F['holidays'] = ([
    'prochain férié', 'quand est le prochain congé férié', 'jours fériés', 'liste des fériés', "c'est quand {HO}", '{HO} est-tu férié',
    'combien de fériés par année', 'est-ce que {HO} est payé', 'les congés fériés cette année', 'prochain long weekend',
    'le prochain congé', 'férié en décembre', '{HO} tombe quel jour', 'quel jour est {HO}', 'combien de jours avant {HO}', '{HO} c’est quand cette année',
    'c’est quand le prochain congé payé', 'prochain jour férié payé',
], [
    'next holiday', 'when is the next stat holiday', 'statutory holidays', 'list of holidays', 'when is {HO}', 'is {HO} a holiday',
    'how many holidays a year', 'is {HO} paid', 'do we get {HO} off', 'is {HO} a paid day off', 'are we off on {HO}', 'next long weekend', 'holidays this year', "when's the next stat", 'next stat', 'what day is {HO}',
    'what day does {HO} fall on', 'how many days until {HO}', 'next paid day off',
], 'HO?')
F['vacation_rule'] = ([
    'combien de semaines de vacances', "j'ai droit à combien de vacances", 'vacances après {Y} ans', 'avec {Y} ans d’ancienneté combien de vacances',
    'pourcentage de vacances', 'combien de vacances par année', 'paie de vacances calculée comment', 'quand j’ai droit à 3 semaines',
    'table des vacances', 'vacances selon l’ancienneté',
], [
    'how many weeks of vacation', 'vacation entitlement', 'vacation after {Y} years', 'with {Y} years of service how much vacation',
    'vacation percentage', 'how is vacation pay calculated', 'when do i get 3 weeks', 'vacation table',
], 'Y?')
F['sick_rule'] = ([
    'combien de jours de maladie par année', "j'ai droit à combien de maladies", 'règle des congés de maladie', 'maladie non prise payée',
    'quand les maladies sont renouvelées', 'les maladies sont payées quand', 'combien de maladies dans la convention',
], [
    'how many sick days per year', 'sick day rules', 'are unused sick days paid', 'when do sick days renew', 'sick leave entitlement',
])
F['overtime_rule'] = ([
    'le temps supp est payé comment', 'quand est-ce que c’est temps double', 'temps et demi quand', 'règle du temps supplémentaire',
    'le samedi c’est payé combien', 'le dimanche c’est temps double', 'combien est payé le temps supp', 'taux du temps supplémentaire',
], [
    'how is overtime paid', 'when is it double time', 'when do i get double time', 'when is time and a half', 'overtime rules', 'saturday overtime rate',
    'is sunday double time', 'overtime rate',
])
F['shift_rule'] = ([
    "la prime de nuit c'est combien", 'combien de plus pour travailler de soir', 'combien de plus de nuit', 'la prime de soir vaut combien de l’heure',
    'combien vaut la prime de soir', 'combien vaut la prime de nuit', 'prime de quart combien', 'la prime de soir est de combien',
    'heures du quart de soir', 'prime pour le 3e quart', 'les primes de quart dans la convention', 'quel montant pour la prime de nuit',
], [
    'how much extra for nights', 'evening premium per hour', 'how much more for working nights',
    'how much is the evening premium', 'how much is the night premium', 'shift premium rate', 'night shift premium amount',
    'what hours is the evening shift', 'shift differential',
])
F['wage_scale'] = ([
    'échelle salariale', 'combien gagne une classe {C}', 'taux de la classe {C} niveau {LV}', 'quel taux pour la classe {C}',
    'si je monte de classe combien', 'les taux de la convention', 'combien paie la classe supérieure', 'niveau {LV} classe {C} combien',
    'échelle des salaires', 'grille salariale',
], [
    'wage scale', 'how much does class {C} make', 'class {C} level {LV} rate', 'pay grid', 'rates in the agreement',
    'what if i move up a class', 'salary scale',
], 'C?')
F['agreement'] = ([
    'ma convention collective', 'quand expire la convention', "c'est quoi la convention", 'la convention finit quand',
    'prochaine augmentation', "c'est quand la prochaine augmentation", 'augmentation de salaire', 'la convention est-tu échue',
], [
    'my collective agreement', 'when does the agreement expire', 'what is the union contract', 'next raise', 'when is the next raise',
    'pay increase',
])
F['fact'] = ([
    'allocation de souliers', 'combien pour les bottes', 'allocation de repas', 'prime d’ancienneté', 'prime de leader',
    'indemnité hebdomadaire', 'assurance invalidité', 'renvoyé faute de travail', 'minimum d’heures payées si on me renvoie', 'combien la compagnie paie l’assurance',
    'part de l’assurance collective', 'banque de temps supplémentaire maximum', 'souliers de sécurité', 'repas en temps supp',
], [
    'safety shoes allowance', 'boot allowance', 'meal allowance', 'seniority premium', 'leader premium', 'weekly indemnity',
    'disability benefit', 'sent home for lack of work', 'insurance cost split', 'maximum banked overtime',
])
F['codes'] = ([
    'le 03 dans (03, 123)', 'le premier chiffre entre parenthèses', 'le deuxième chiffre entre parenthèses', 'pourquoi (00, 123) et (03, 123)',
    'les codes entre parenthèses', "c'est quoi (00, 123)", 'pourquoi 00 et 03', 'les chiffres entre parenthèses', 'code 123',
    'pourquoi deux codes pour les heures', 'que veut dire le code', 'centre de coûts',
], [
    'the 03 in (03, 123)', 'first number in brackets', 'why (00, 123) and (03, 123)',
    'the codes in brackets', 'what is (00, 123)', 'why 00 and 03', 'numbers in parentheses', 'code 123', 'why two codes for hours',
])
F['greeting'] = ([
    'bonjour', 'salut', 'allo', 'bonsoir', 'yo', 'hey', 'coucou', 'bon matin', 'salut ça va',
], ['hello', 'hi', 'hey', 'good morning', 'yo', 'hi there', 'good evening'])
F['thanks'] = ([
    'merci', 'merci beaucoup', 'parfait merci', 'super', 'cool merci', 'ok merci', 'génial', "c'est beau merci", 'nice',
], ['thanks', 'thank you', 'great thanks', 'perfect', 'awesome', 'ok thanks', 'cool'])
F['help'] = ([
    'quel genre de questions', 'quelles questions tu comprends', 'tu peux répondre à quoi', 'qu’est-ce que je peux te demander',
    'que peux-tu faire', 'aide', 'comment ça marche', 'quelles questions je peux poser', "t'es qui", 'tu sers à quoi', 'exemples de questions',
    'je peux te demander quoi', 'menu', 'comment t’utiliser',
], [
    'what kind of questions can you answer', 'what questions do you understand', 'what can i ask you about','what can you do', 'help', 'how does this work', 'what can i ask', 'who are you', 'examples', 'how do i use this'])
F['privacy'] = ([
    'mes données sont envoyées', 'est-ce que mon talon est envoyé quelque part', 'c’est privé', 'qui voit ma paie', 'est-ce sécuritaire',
    'mes infos restent où', 'tu envoies mes données', 'est-ce que mon employeur voit ça', 'est-ce que mon talon est téléversé', 'mes questions sont-elles enregistrées',
    'est-ce que ça part sur internet', 'tu gardes mes infos',
], ['is my data sent', 'is this private', 'who can see my payslip', 'is it safe', 'where does my data go', 'does my employer see this',
    'does this upload my payslip', 'is my payslip uploaded', 'are my questions saved', 'do you keep my data', 'does it go online'])
F['other'] = ([
    'qui a gagné la partie hier', 'capitale de la france', 'comment changer un pneu', 'je veux commander une pizza', 'combien coûte un iphone', 'quel âge a la terre', 'trouve-moi un restaurant', 'joue de la musique', 'réserve un vol', "c'est quoi l'intelligence artificielle", 'aide-moi avec mes devoirs', 'combien de calories dans une pomme', 'comment faire du pain', 'meilleur téléphone', 'qui est le président', 'quelle est la population du québec', 'conseils pour dormir', 'horaire de l’autobus', 'prix de l’essence', 'comment investir en bourse', 'traduis bonjour en anglais', 'raconte une histoire', 'ouvre netflix', 'appelle maman',
    'quel temps fait-il', 'raconte une blague', "c'est qui le premier ministre", 'recette de pâté chinois', 'résultat du hockey',
    'quelle heure est-il', 'je veux un hamburger', 'traduis ce texte', 'écris un poème', 'combien coûte une auto', 'où est le walmart',
    'les canadiens ont gagné', 'comment réparer mon char', 'meilleur film', 'la météo demain', 'parle-moi de toi', 'combien font 2 plus 2',
], [
    'who won the game last night', "what's the capital of france", 'how do i change a tire', 'order a pizza', 'how much is an iphone', 'how old is the earth', 'find me a restaurant', 'book a flight', 'what is artificial intelligence', 'help with my homework', 'calories in an apple', 'how to bake bread', 'best phone', 'who is the president', 'population of canada', 'tips to sleep better', 'bus schedule', 'gas prices', 'how to invest in stocks', 'tell me a story', 'open netflix', 'call mom', 'stock market today',
    'what is the weather', 'tell me a joke', 'who is the prime minister', 'recipe for lasagna', 'hockey score', 'what time is it',
    'write a poem', 'how much is a car', 'where is walmart', 'best movie', 'fix my car', 'what is 2 plus 2', 'play music',
])

H2_FR = ['temps supp', 'temps supplémentaire', 'férié', 'vacances', 'maladie', 'régulières', 'soir', 'nuit']
H2_EN = ['overtime', 'holiday', 'vacation', 'sick', 'regular', 'evening', 'night']


def typo(s, p=0.22):
    if R.random() > p or len(s) < 6:
        return s
    i = R.randrange(1, len(s) - 1)
    op = R.random()
    if op < 0.4:
        return s[:i] + s[i + 1:]                     # dropped letter
    if op < 0.7:
        return s[:i] + s[i + 1] + s[i] + s[i + 2:]   # swapped letters
    return s[:i] + s[i] + s[i:]                      # doubled letter


def fill(frame, lang, slot):
    lines = LINES_FR if lang == 'fr' else LINES_EN
    terms = TERMS_FR if lang == 'fr' else TERMS_EN
    out = frame
    if '{L}' in out:
        out = out.replace('{L}', R.choice(lines))
    if '{T}' in out:
        out = out.replace('{T}', R.choice(terms))
    if '{H2}' in out:
        out = out.replace('{H2}', R.choice(H2_FR if lang == 'fr' else H2_EN))
    if '{HO}' in out:
        out = out.replace('{HO}', R.choice(HOLIDAYS_FR if lang == 'fr' else HOLIDAYS_EN))
    if '{N}' in out:
        out = out.replace('{N}', str(R.choice([14, 16, 18, 20, 22, 24, 26, 44, 46, 52, 55, 85, 'a', 'b', 'e', 'f', 'j'])))
    if '{M}' in out:  # an amount of money
        out = out.replace('{M}', R.choice([str(R.randint(3, 15) * 100), str(R.randint(300, 1500)), f'{R.randint(300, 1500)},{R.randint(10, 99)}']))
    if '{Y}' in out:
        out = out.replace('{Y}', str(R.choice([1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30])))
    if '{C}' in out:
        out = out.replace('{C}', str(R.randint(1, 12)))
    if '{LV}' in out:
        out = out.replace('{LV}', R.choice(['a', 'b', 'c', 'A', 'B', 'C']))
    return out


def make(intent, n_per_lang):
    spec = F[intent]
    fr, en = spec[0], spec[1]
    rows = []
    for lang, frames in (('fr', fr), ('en', en)):
        opens, ends = (OPEN_FR, END_FR) if lang == 'fr' else (OPEN_EN, END_EN)
        for _ in range(n_per_lang):
            q = fill(R.choice(frames), lang, None)
            if intent not in ('greeting', 'thanks'):
                q = R.choice(opens) + q + R.choice(ends)
            q = ' '.join(typo(w) for w in q.split(' '))
            if R.random() < 0.15:
                q = q.replace('’', "'").replace("'", ' ')
            if R.random() < 0.1:
                q = q.upper()
            rows.append((intent, q.strip()))
    return rows


def main():
    rows = []
    for intent, spec in F.items():
        n = 260 if intent not in ('greeting', 'thanks') else 90
        if intent == 'other':
            n = 520
        if len(spec) > 2:
            n = 380  # frames with a slot need more variety
        rows += make(intent, n)
    R.shuffle(rows)
    w = sys.stdout
    for intent, q in rows:
        w.write(f'{intent}\t{q}\n')


if __name__ == '__main__':
    main()
