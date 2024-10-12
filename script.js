const base = Module.findBaseAddress('libUE4.so');
const addCoin = base.add(0x69a4450);

Interceptor.attach(addCoin, {
    onEnter: function(args) {
        this.instance = args[0];
        console.log(`\n[*] AddCoin() is called, class instance is ${args[0]}`);
    },
    onLeave: function(ret) {
        console.log(`[*] TotalCoins are stored at class instance + 0x310`);
        console.log(hexdump(ptr(this.instance).add(0x310), {length: 16}));
    }
})

let unsetWatchPoint = false;
let _addr, _size, _conditions;
let threads = null;
function installWatchpoint(addr, size, conditions) {
    _addr = addr;
    _size = size;
    _conditions = conditions;
    threads = Process.enumerateThreads().filter(t => t.name === "GameThread");  
    for (const thread of threads) {
        Process.setExceptionHandler(e => {
          console.log(`\n[!] ${e.context.pc} tried to "${_conditions}" at ${_addr}`);
          if (['breakpoint', 'single-step'].includes(e.type)) {
            thread.unsetHardwareWatchpoint(0);
            unsetWatchPoint = true;
            return true;
          }      
          return false;
        });   
        thread.setHardwareWatchpoint(0, addr, size, conditions);
        console.log(`[*] HardwareWatchpoint set at ${addr} (${thread.id} ${thread.name})`);
    }
}

function reInstallWatchPoint() {
    for (const thread of threads) {
        thread.setHardwareWatchpoint(0, _addr, _size, _conditions);
    }
}

var int = setInterval(() => {
    if (unsetWatchPoint) {
        reInstallWatchPoint();
        unsetWatchPoint = false;
    }
}, 0);