import unittest

from core.phone_numbers import normalize_phone


class PhoneNumberTest(unittest.TestCase):
    def test_normalize_us_phone(self):
        self.assertEqual(normalize_phone("415 555 1212", "US"), "+14155551212")

    def test_normalize_uk_phone(self):
        self.assertEqual(normalize_phone("07700 900111", "UK"), "+447700900111")

    def test_rejects_invalid_country(self):
        with self.assertRaises(ValueError):
            normalize_phone("07700 900111", "DE")

    def test_rejects_invalid_uk_phone(self):
        with self.assertRaises(ValueError):
            normalize_phone("12345", "UK")


if __name__ == "__main__":
    unittest.main()
