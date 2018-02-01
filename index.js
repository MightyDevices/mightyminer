/* stratum client */
const Stratum = require('./stratum');
/* data structure that represents stratum notifications */
const StratumNotification = require('./stratum-notification');
/* class for converting stratum notifications to mining jobs */
const StratumMiningJob = require('./stratum-mining-job');
/* class for constructing stratum submission upon mining results */
const MiningResultStratum = require('./mining-result-stratum');
/* data structure used to represent jobs */
const MiningJob = require('./mining-job');
/* mining hardware */
const BM1380 = require('./bm1380');
/* streams */
const Stream = require('stream');


/* connection parameters */
var stratumConnectionParams = {
    host : 'stratum.bitcoin.cz',
    port : 3333,
    user : 'login',
    pass : 'password'
};


/* miner parameters */
var minerParams = {
    portName : 'COM33',
    frequency : 193,
};


/* open the minign hardware */
var miner = new BM1380(minerParams);
/* listen to 'open' events */
miner.once('open', () => { 
    /* show message */
    console.log('Miner opened');
    console.log('Chain length: ' + miner.chainLength);
    console.log('Hashrate (GH/s): ' + miner.hashRate / 1000000000);
    console.log('Timeout (ms): ' + miner.timeout);
    /* connect mining job generator to the miner */
    stratumMiningJob.pipe(miner);
    /* feed results back to stratum network via mining results 
     * converter */
    miner.pipe(miningResultStratum).pipe(stratum);
});
/* listen to 'open' events */
miner.on('start', () => { console.log('Mining started'); });
/* listen to 'open' events */
miner.on('stop', () => { console.log('Mining stopped'); });
/* on close */
miner.once('close', () => { console.log('Miner closed') } );
/* mining errors */
miner.on('error', (e) => {console.log('Miner error! ' + e) });
/* listen to data events to count the potential hashrate */
miner.on('data', (data) => {
});


/* create stratum client object */
var stratum = new Stratum(stratumConnectionParams);
/* listen to 'open' events */
stratum.once('open', () => { 
    console.log('Stratum connection established'); 
    /* pipe to stratum to mining job */
    stratum.pipe(stratumMiningJob); 
});
/* monitor errors */
stratum.once('error', (error) => console.log(error));
/* on close */
stratum.once('close', () => { console.log('Stratum closed') } );


/* create Stratum to MiningJob converter */
var stratumMiningJob = new StratumMiningJob();
/* convert mining results to stratum submissions */
var miningResultStratum = new MiningResultStratum();
/* push data to display */
miningResultStratum.on('data', display);

/* display work progres */
function display (data)
{
    console.log('Found valid nonces: ' + data.stratumSubmission.nonces);
}



