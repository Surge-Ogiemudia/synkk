const P = require('pusher-js');
console.log(typeof P, Object.keys(P));
if (P.default) console.log('Has default', typeof P.default);
