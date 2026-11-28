// @ts-check
/** Photo du voyage (réduite à 1000 px, en data URL). thumb : miniature ronde.
 * @typedef {{id:number,t:number,lat:number,lon:number,est:boolean,cap?:string,place?:string,src:string,noDate?:boolean,thumb?:HTMLCanvasElement}} Photo
 * Étape : photos prises au même endroit.
 * @typedef {{i:number,key:number,lat:number,lon:number,n:number,t0:number,t1:number,photos:Photo[],auto:string,iso:string,name:string,x:number,y:number,view:number[],show:Photo[]}} Stop
 * Trajet entre deux étapes (en vol au-delà de 250 km).
 * @typedef {{a:Stop,b:Stop,km:number,fly:boolean,pts:number[][],cum:number[],len:number}} Leg
 * Morceau de la séquence animée.
 * @typedef {{kind:'intro'|'stay'|'leg'|'outro',dur:number,t0:number,s?:any,L?:any,i?:number,from?:any,to?:any,z?:any}} Step */

/** État mutable partagé du voyage, de la carte et de la lecture. */
export const etat = {
  /** @type {(iso:string)=>string} */ regionName: iso => iso,
  WORLD_TXT: '',
  /** [nom, lat, lon, pays, population] @type {any[][]} */ CITIES: [],
  /** @type {number[][]} */ CXY: [],
  /** @type {Path2D|null} */ landP: null,
  /** @type {Path2D|null} */ bordP: null,
  /** @type {Path2D|null} */ gratP: null,
  /** @type {Photo[]} */ photos: [],
  /** @type {Stop[]} */ stops: [],
  /** @type {Leg[]} */ legs: [],
  /** @type {Step[]} */ seq: [],
  T: 1,
  /** @type {Record<string,string>} */ names: {},
  isDemo: true,
  pid: 0,
  W: 800,
  H: 600,
  DPR: 1,
  /** @type {Record<string,string>} */ C: {},
  t: 0,
  playing: false,
  speed: 1,
  last: 0,
  /** requestAnimationFrame en cours (0 : boucle arrêtée) */ raf: 0,
  /** images dessinées par la boucle de lecture (tests) */ frames: 0,
  /** fonds de carte recalculés (tests : rien pendant un séjour) */ baseDraws: 0,
  /** @type {string|null} */ hash: null,
  dragN: 0,
  /** @type {any} */ downloads: null,
  /** carnet HTML du dernier téléchargement (tests) */ lastExport: '',
  /** appli démarrée */ ready: false,
};
