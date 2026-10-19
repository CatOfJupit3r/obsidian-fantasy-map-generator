import { fetchAndBuildFmg } from './fmg-cache';
import { FMG_CACHE_DIR } from './fmg-paths';

const cache = await fetchAndBuildFmg(FMG_CACHE_DIR);
console.log(`FMG is built in ${cache.buildDir}.`);
