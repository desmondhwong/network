// Machine-authored by Codex/OpenAI. Approximate Earth map locations, consulted
// 2026-10-01. Coordinate sources and scope: data-sources/launch-sites/provenance.md.
// These presets do not model launch pads, terrain elevation or launch operations.
const SPACEX = 'https://www.spacex.com/assets/media/falcon-users-guide-2025-05-09.pdf';
const JPL = 'https://descanso.jpl.nasa.gov/monograph/series12/LunarTraj--07Chapter6Operations.pdf';
const ROCKET_LAB = 'https://rocketlabcorp.com/assets/Electron-Payload-User-Guide-7.0-v6.pdf';
const CMSE = 'https://statistics.cmse.gov.cn/xwzx/202302/t20230203_52462.html';

export const LAUNCH_SITES = Object.freeze([
  {id:'launch-cape-canaveral',label:'Cape Canaveral · SLC-40',latitude:28.562,longitude:-80.5772,sourceUrl:SPACEX,sourceLocation:'SLC-40 location, PDF page 69'},
  {id:'launch-kennedy-lc39a',label:'Kennedy Space Center · LC-39A',latitude:28.6082,longitude:-80.6041,sourceUrl:SPACEX,sourceLocation:'LC-39A location, PDF page 70'},
  {id:'launch-vandenberg',label:'Vandenberg · SLC-4E',latitude:34.632,longitude:-120.6107,sourceUrl:SPACEX,sourceLocation:'Section 8.2, PDF page 73'},
  {id:'launch-baikonur',label:'Baikonur Cosmodrome',latitude:45.96,longitude:63.35,sourceUrl:JPL,sourceLocation:'Table 6-1, printed page 302'},
  {id:'launch-kourou',label:'Kourou · Guiana Space Centre',latitude:5.24,longitude:-52.77,sourceUrl:JPL,sourceLocation:'Table 6-1, printed page 302'},
  {id:'launch-tanegashima',label:'Tanegashima Space Center',latitude:30.39,longitude:130.97,sourceUrl:JPL,sourceLocation:'Table 6-1, printed page 302'},
  {id:'launch-satish-dhawan',label:'Satish Dhawan · Sriharikota',latitude:13.74,longitude:80.24,sourceUrl:JPL,sourceLocation:'Table 6-1, printed page 302'},
  {id:'launch-wenchang',label:'Wenchang Space Launch Site',latitude:19.65,longitude:110.966667,sourceUrl:CMSE,sourceLocation:'Opening location, 19°39′ N / 110°58′ E'},
  {id:'launch-mahia',label:'Māhia · Rocket Lab LC-1',latitude:-39.262,longitude:177.865,sourceUrl:ROCKET_LAB,sourceLocation:'Launch Complex 1, printed page 50'},
].map(site=>Object.freeze({...site,bodyId:'Earth',approximate:true,sourceAccessed:'2026-10-01'})));

// Same [latitude, longitude] contract as the existing city presets.
export const LAUNCH_SITE_PLACES = Object.freeze(Object.fromEntries(
  LAUNCH_SITES.map(site=>[site.id,Object.freeze([site.latitude,site.longitude])])
));
