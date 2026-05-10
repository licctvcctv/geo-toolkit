from django.test import SimpleTestCase

from .geo_calculations import calculate_structural_formula, identify_mineral


CHLORITE_ROWS = [
    {
        'Sample': '403-353.2-03',
        'SiO2': '31.106',
        'TiO2': '0.031',
        'Al2O3': '21.088',
        'Cr2O3': '0',
        'FeO': '11.234',
        'MnO': '0.291',
        'MgO': '20.37',
        'CaO': '0.006',
        'Na2O': '0.044',
        'K2O': '2.99',
        'BaO': '0',
    },
    {
        'Sample': '403-503.6-01',
        'SiO2': '38.712',
        'TiO2': '0.056',
        'Al2O3': '22.243',
        'Cr2O3': '0',
        'FeO': '9.597',
        'MnO': '0.101',
        'MgO': '15.953',
        'CaO': '0.063',
        'Na2O': '0.029',
        'K2O': '2.861',
        'BaO': '0',
    },
]

MUSCOVITE_ROW = {
    'Sample': 'ZK403-122.7-ser 03',
    'SiO2': '46.26',
    'TiO2': '0.19',
    'Al2O3': '36.68',
    'Cr2O3': '0.02',
    'FeO': '1.04',
    'MnO': '0',
    'MgO': '1.05',
    'CaO': '0',
    'Na2O': '0.62',
    'K2O': '11.1',
    'BaO': '0',
}

BIOTITE_ROW = {
    'Sample': 'zk1203-526-bio 01',
    'SiO2': '38.75',
    'TiO2': '2.207',
    'Al2O3': '16.133',
    'Cr2O3': '0',
    'FeO': '6.88',
    'MnO': '0.06',
    'MgO': '20.301',
    'CaO': '0.002',
    'Na2O': '0.197',
    'K2O': '9.914',
    'BaO': '0.014',
}


class MineralIdentificationTests(SimpleTestCase):
    def classify(self, row):
        formula_22 = calculate_structural_formula(row, 22)
        self.assertIsNotNone(formula_22, f'expected valid 22O formula for {row["Sample"]}')
        return identify_mineral(formula_22)

    def test_chlorite_rows_with_moderate_alkalis_are_identified_as_chlorite(self):
        for row in CHLORITE_ROWS:
            with self.subTest(sample=row['Sample']):
                self.assertEqual(self.classify(row), 'Chlorite')

    def test_muscovite_reference_row_stays_muscovite(self):
        self.assertEqual(self.classify(MUSCOVITE_ROW), 'Muscovite')

    def test_biotite_reference_row_stays_biotite(self):
        self.assertEqual(self.classify(BIOTITE_ROW), 'Biotite')
