import pikepdf, re, sys
src, dst = sys.argv[1], sys.argv[2]
R = [
 (r"\(Nom\)", "(Name)"), (r"\(Soci\xe9t\xe9\)", "(Company)"),
 (r"Retenues pay\xe9es par l'employ\xe9", "Earnings"),
 (r"Imp\xf4ts sur les salari\xe9s", "Employee Taxes"),
 (r"Revenus ou retenues", "Post Tax Deductions"), (r"D\xe9ductions employ\xe9", "Pre Tax Deductions"),
 (r"Prestations pay\xe9es par l'employeur imposables", "Taxable Wages"),
 (r"Paie brute", "Gross Pay"), (r"Paie nette", "Net Pay"), (r"\(Actuel\)", "(Current)"), (r"\(Cumul annuel\)", "(YTD)"),
 (r"\(Heures\)", "(Hours)"), (r"\(Taux\)", "(Rate)"), (r"\(annuelles\)", "(YTD)"), (r"\(cumul\xe9es\)", "( )"),
 (r"\(annuel cumul\xe9\)", "(YTD)"), (r"\(Montant Cumul annuel\)", "(Amount YTD)"), (r"\(Montant\)", "(Amount)"),
 (r"F\xe9d\xe9ral\)", "Federal)"), (r"R\xe9gimes d'absences", "Absence Plans"),
 (r"\(Cumul\xe9\)", "(Accrued)"), (r"\(R\xe9duit\)", "(Reduced)"), (r"\(Disponible\)", "(Available)"),
 (r"Information sur le paiement", "Payment Information"), (r"\(Banque\)", "(Bank)"), (r"Nom du compte", "Account Name"), (r"N\xba de compte", "Account Number"),
 (r"AE[\xa0 ]- Assurance-emploi", "EI - Employment Insurance"),
 (r"IRF[\xa0 ]- Imp\xf4t sur le revenu f\xe9d\xe9ral", "FIT - Federal Income Tax"),
 (r"RQAP[\xa0 ]- R\xe9gime qu\xe9b\xe9cois d'assurance[^)]*", "QPIP - Quebec Parental Insurance Plan"),
 (r"RRQ[\xa0 ]- R\xe9gime de rentes du Qu\xe9bec", "QPP - Quebec Pension Plan"),
 (r"IRP Qc[\xa0 ]- Imp\xf4t sur le revenu provincial", "PIT QC - Provincial Income Tax"),
 (r" - Salaires assujettis", " - Subject Wages"), (r" - Salaires imposables", " - Taxable Wages"),
 (r"Montant total de la demande", "Total Claim Amount"),
]
pdf = pikepdf.open(src)
for page in pdf.pages:
    cs = page.obj.Contents
    for c in (cs if isinstance(cs, pikepdf.Array) else [cs]):
        t = c.read_bytes().decode('latin-1')
        for a, b in R: t = re.sub(a, b, t)
        c.write(t.encode('latin-1'))
pdf.save(dst)
