const CryptoJS = require('crypto-js');
const key = CryptoJS.enc.Utf8.parse('38346591');
const encrypted = 'ID2ieOjCrwfgWvL5sXl4B1ImC5QfbsDyPgia5m7T7U4VLl0JRX9Gn4HEX+RKmDEyEYR6Up7jk21qN7/qcIWm7Bw7tS9a8Gtq';
const decrypted = CryptoJS.DES.decrypt(
  { ciphertext: CryptoJS.enc.Base64.parse(encrypted) },
  key,
  { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
);
const url = decrypted.toString(CryptoJS.enc.Utf8);
console.log('Decrypted URL:', url);
