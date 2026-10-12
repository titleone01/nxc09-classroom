import path from 'node:path';
import {writeOffline} from './offline-builder.mjs';
const root=import.meta.dirname;
console.log(JSON.stringify(await writeOffline(root,path.join(root,'offline/NXC09_离线.html'),{
 onlineUrl:'https://titleone01.github.io/nxc09-classroom/'
})));
