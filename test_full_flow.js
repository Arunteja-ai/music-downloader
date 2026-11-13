const CryptoJS = require('crypto-js');

function decryptMediaUrl(encryptedMediaUrl) {
  try {
    const key = CryptoJS.enc.Utf8.parse('38346591');
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encryptedMediaUrl) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    let url = decrypted.toString(CryptoJS.enc.Utf8);
    // Upgrade quality to 320kbps
    if (url.includes('_96.mp4')) {
      url = url.replace('_96.mp4', '_320.mp4');
    } else if (url.includes('_160.mp4')) {
      url = url.replace('_160.mp4', '_320.mp4');
    }
    return url;
  } catch (e) {
    return null;
  }
}

async function testSong(query) {
  const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();
  const song = data.results[0];
  if (!song) {
    console.log(`[${query}] Not found`);
    return;
  }
  const fullAudioUrl = decryptMediaUrl(song.encrypted_media_url);
  console.log(`[${query}]`);
  console.log(`  Title: ${song.song}`);
  console.log(`  Artist: ${song.primary_artists}`);
  console.log(`  Year: ${song.year} | Duration: ${song.duration}s (${Math.floor(song.duration/60)}m ${song.duration%60}s)`);
  console.log(`  Full 320kbps Audio: ${fullAudioUrl}`);
}

async function run() {
  await testSong('Arabic Kuthu');
  await testSong('Naatu Naatu');
  await testSong('Kesariya');
  await testSong('Coldplay Yellow');
}

run();
