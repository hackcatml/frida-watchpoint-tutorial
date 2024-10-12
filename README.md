# frida-watchpoint-tutorial
A great feature called [setHardwareWatchpoint](https://frida.re/news/2024/09/06/frida-16-5-0-released/) was introduced in Frida version 16.5.0. This makes it easy to determine where memory is being read from or written to.

I will explore how to use this feature through a sample Unreal Engine v4.27.2 game.<br>
Readers can download it from the [release](https://github.com/hackcatml/frida-watchpoint-tutorial/releases/tag/v1.0.0) section.<br>
Since I made the Unreal game myself and already know the logic, I will skip the SDK dump and analysis. I recommend that readers try dumping and analyzing the game logic themselves.

- [Android Unreal Engine Tutorial](#android-unreal-engine-tutorial)
- [What about iOS?](#what-about-ios)

## Android Unreal Engine Tutorial

EndlessRunner is a game where you collect coins while running.  
Let’s run the game and attach a Frida script.
```
frida -UF -l script.js
```

As the game progresses, you will see the following logs:  
The number of coins is stored at 0x74cf563e30.
```
[Galaxy S10::EndlessRunner ]->
[*] AddCoin() is called, class instance is 0x74cf563b20
[*] TotalCoins are stored at class instance + 0x310
             0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
74cf563e30  01 00 00 00 00 00 00 00 40 72 56 cf 74 00 00 00  ........@rV.t...

[*] AddCoin() is called, class instance is 0x74cf563b20
[*] TotalCoins are stored at class instance + 0x310
             0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
74cf563e30  02 00 00 00 00 00 00 00 40 72 56 cf 74 00 00 00  ........@rV.t...

[*] AddCoin() is called, class instance is 0x74cf563b20
[*] TotalCoins are stored at class instance + 0x310
             0  1  2  3  4  5  6  7  8  9  A  B  C  D  E  F  0123456789ABCDEF
74cf563e30  03 00 00 00 00 00 00 00 40 72 56 cf 74 00 00 00  ........@rV.t...
```

Where is memory 0x74cf563e30 being written to?  
Let’s set a watchpoint.  
![image](https://github.com/user-attachments/assets/0e773c44-bc8d-4bc7-8dc2-b8b0318c1f58)

[!] **Which thread should we set the watchpoint on?**<br>
In [setHardwareWatchpoint](https://frida.re/news/2024/09/06/frida-16-5-0-released/) example, a watchpoint is set on `Process.enumerateThreads()[0]`.  
In an Unreal Engine game, this is the main thread, but you will find that setting the watchpoint here doesn’t yield any results.  
If you take a closer look at the thread names, you’ll notice a thread called `GameThread`. This is where the watchpoint needs to be set.  
![image](https://github.com/user-attachments/assets/36f55ccb-8aaf-4968-a71d-22afa234470c)

If you’re unsure which thread to set the watchpoint on, you can try setting it on all threads. The game may crash, but you’ll be able to obtain the thread name.  
In this case, the installWatchpoint function in the script would be modified as follows:
```javascript
function installWatchpoint(addr, size, conditions) {
    _addr = addr;
    _size = size;
    _conditions = conditions;
    threads = Process.enumerateThreads();  
    for (const thread of threads) {
        Process.setExceptionHandler(e => {
          console.log(`\n[!] ${e.context.pc} tried to "${_conditions}" at ${_addr} (${thread.id} ${thread.name})`);
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
```

Once you set a watchpoint at 0x74cf563e30 and progress in the game, the script will print out where memory 0x74cf563e30 is being accessed and written to.
![image](https://github.com/user-attachments/assets/c1ef648a-3317-43db-9bd0-076c8631f55c)

Memory at 0x74cf563e30 is being accessed and written to at 0x751ae5a47c, so let’s examine the instruction at that location.  
It stores the value of `w9` at `x0 + 310`.
![image](https://github.com/user-attachments/assets/403a50e9-1017-459c-ac7d-0da48246899a)

So, before the value is stored at `x0 + 310`, if we change the value of `w9`, we can increase the number of coins.  
Before hooking the registers at 0x751ae5a47c, let’s unset the watchpoint and detach the interceptor to avoid unexpected crashes.  
![image](https://github.com/user-attachments/assets/b0384817-105e-496a-a035-004a9582f9c5)

Now, let’s hook at 0x751ae5a47c and add +100 to the value of the `x9` register at the onEnter point.
![image](https://github.com/user-attachments/assets/98a3c1ab-ef1d-471c-bcfa-ac46edbb0cf1)

Success!<br>
![screencapture-1728607249785](https://github.com/user-attachments/assets/b86e55a6-1122-408c-b7b1-2c3f6ee30cbe)

## What about iOS?

The method is the same for Android.  
However, finding the thread to set the watchpoint on is a bit more troublesome compared to Android.  
This is because, when you print the thread names, no meaningful thread names are shown.  
![image](https://github.com/user-attachments/assets/e5fb650a-afbc-4729-af34-dd8cb0385886)

Also, if you set a watchpoint on all threads and observe, incorrect information is displayed.  
In the picture below, it appears that the `com.apple.CoreMotion.MotionThread` is writing to memory.  
![image](https://github.com/user-attachments/assets/a5755a97-adb5-4993-8c85-cb5695d9a47b)

However, when you set the watchpoint only on `com.apple.CoreMotion.MotionThread` and run the game, you don't get any results.  
![image](https://github.com/user-attachments/assets/9c87775a-c065-4b40-aa08-df6c02970360)

Perhaps the best method is to set the watchpoint on each thread one by one and check.  
Since no meaningful thread names are visible, could it be one of the undefined threads?  
Bingo!  
![image](https://github.com/user-attachments/assets/56e2d347-bf78-4d94-894a-b45090a2afb4)

## Contact
- Channel: https://t.me/hackcatml1  
- Chat: https://t.me/hackcatmlchat
