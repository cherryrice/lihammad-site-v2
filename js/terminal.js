// js/terminal.js — Kali-style terminal: commands, boot, matrix rain
// Depends on: data.js (HOUSES, SHIELD_COLORS, SIGILS)

(function() {
  // ── State ──
  var pendingHouse  = null;
  var pendingName   = null;
  var awaitingName  = false;
  var cmdHistory    = [];
  var historyIdx    = -1;
  var matrixRunning = false;
  var matrixTimer   = null;
  var locked        = false;

  // ── Filesystem tree ──
  var FS = {
    '/': ['home','etc','var','usr','opt','tmp'],
    '/home': ['lihammad'],
    '/home/lihammad': ['projects','notes.txt','raven_mail'],
    '/home/lihammad/projects': ['lihammad.com','kali-config','maester-scripts'],
    '/home/lihammad/raven_mail': ['inbox','sent'],
    '/home/lihammad/raven_mail/inbox': ['from_cersei.msg','from_ned.msg'],
    '/etc': ['passwd','hostname','shadow'],
    '/var': ['log','spool'],
    '/usr': ['bin','local'],
    '/tmp': [],
  };
  var currentDir = '/home/lihammad';
  var fileContents = {
    '/home/lihammad/notes.txt': 'I must not forget the words.\nWinter is coming.\nAlways.',
    '/etc/hostname': 'kali',
    '/home/lihammad/raven_mail/inbox/from_cersei.msg': 'When you play the game of thrones, you win or you die.',
    '/home/lihammad/raven_mail/inbox/from_ned.msg': 'I found something in the crypts. Meet me at nightfall.',
  };

  // ── DOM refs (initialized in DOMContentLoaded) ──
  function $id(id) { return document.getElementById(id); }
  var termEl    = null;
  var outputEl  = null;
  var inputEl   = null;
  var promptLbl = null;
  var titleBar  = null;
  var matCanvas = null;
  var out       = null;
  var inp       = null;
  var inputLocked = false;

  // ── User/prompt ──
  function getUser() {
    if (!pendingName || !pendingHouse) return 'serf';
    var n = pendingName.replace(/\s+/g,'').toLowerCase();
    var h = HOUSES[pendingHouse].display.replace(/\s+/g,'').toLowerCase();
    return (n === h || n.indexOf(h) !== -1) ? n : n + h;
  }
  function updatePromptUI() {
    var u = getUser();
    if (promptLbl) promptLbl.textContent = u + '@kali:~$ ';
    if (titleBar)  titleBar.textContent  = u + '@kali — terminal';
  }

  function println(text, cls) {
    var d = document.createElement('span');
    d.className = 'term-line ' + (cls || 'c-wht');
    d.textContent = text;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  }

  function printHTML(html) {
    var d = document.createElement('span');
    d.className = 'term-line';
    d.innerHTML = html;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
  }

  function blank() { println('', 'c-dim'); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function lock()   { inputLocked = true;  inp.disabled = true; }
  function unlock() { inputLocked = false; inp.disabled = false; inp.focus(); }

  function seqPrint(lines, delay, cb) {
    var i = 0;
    function next() {
      if (i < lines.length) { println(lines[i][0], lines[i][1]); i++; setTimeout(next, delay); }
      else if (cb) cb();
    }
    next();
  }



  // =====================================================
  // NAME INPUT FLOW
  // =====================================================
  function handleNameInput(raw) {
    echoPrompt(raw);
    var name = raw.trim();
    if (!name) {
      println('You must declare your name, serf.', 'c-gld');
      println('Enter your given name:', 'c-wht');
      return;
    }
    awaitingName = false;
    pendingName  = name;
    blank();
    println('So be it.', 'c-gld');
    blank();
    println(name + ' of House ' + HOUSES[pendingHouse].display + '...', 'c-gld');
    println(HOUSES[pendingHouse].words, 'c-wht');
    blank();
    println('Opening the gates of lihammad.com...', 'c-wht');
    setTimeout(function () { goSite(pendingHouse, pendingName); }, 900);
  }

  // =====================================================
  // COMMAND ROUTER
  // =====================================================
  function runCmd(raw) {
    var trimmed = raw.trim();
    echoPrompt(raw);
    if (!trimmed) return;
    cmdHist.unshift(trimmed);
    histIdx = -1;

    var parts = trimmed.split(/\s+/);
    var cmd   = parts[0].toLowerCase();
    var args  = parts.slice(1);

    // house selection
    if (cmd === 'swear-allegiance' || cmd === 'swear') { cmdSwear(args); return; }

    if (cmd === 'home') {
      if (pendingName && pendingHouse) {
        println('Returning to ' + pendingName + ' of House ' + HOUSES[pendingHouse].display + '...', 'c-gld');
        setTimeout(function () { goSite(pendingHouse, pendingName); }, 600);
      } else {
        println('You must first swear allegiance to a house.', 'c-gld');
        println('Type: swear-allegiance <house>', 'c-wht');
        println('e.g.: swear-allegiance targaryen', 'c-dim');
      }
      return;
    }

    switch (cmd) {
      case 'help':        cmdHelp();            break;
      case 'houses':      cmdHouses();          break;
      case 'clear':       out.innerHTML = '';   break;
      case 'about':       cmdAbout();           break;
      case 'reboot':
        println('Rebooting...', 'c-ylw');
        setTimeout(function () { out.innerHTML = ''; boot(); }, 900);
        break;
      case 'shutdown':
        println('Shutting down...', 'c-ylw');
        lock();
        setTimeout(function () {
          out.style.opacity = '0';
          setTimeout(function () { out.innerHTML = ''; out.style.opacity = '1'; unlock(); }, 900);
        }, 800);
        break;
      case 'exit':
      case 'logout':
        if (pendingName && pendingHouse) {
          println('Returning to ' + pendingName + ' of House ' + HOUSES[pendingHouse].display + '...', 'c-gld');
          setTimeout(function () { goSite(pendingHouse, pendingName); }, 600);
        } else {
          println('You cannot leave until you swear allegiance.', 'c-gld');
          cmdHouses();
        }
        break;
      // system
      case 'whoami':    println(getUser(), 'c-grn'); break;
      case 'id':        println('uid=0(' + getUser() + ') gid=0 groups=0,999(smallfolk)', 'c-wht'); break;
      case 'hostname':  println('kali', 'c-wht'); break;
      case 'uname':     println(args.indexOf('-a') !== -1 ? 'Linux kali 6.1.0 #1 SMP x86_64 Westeros/GNU' : 'Linux', 'c-wht'); break;
      case 'date':      println(new Date().toString(), 'c-wht'); break;
      case 'uptime':    println('up ' + (Math.floor(Math.random() * 99) + 1) + ' days, the realm endures', 'c-wht'); break;
      case 'pwd':       println('/home/' + getUser(), 'c-wht'); break;
      case 'ls':        println('readme.txt    allegiance.txt    lihammad.com/', 'c-wht'); break;
      case 'cat':
        if (args[0] === 'readme.txt')      { println('LIHAMMAD TERMINAL\nSwear allegiance to a house to enter.\nType "houses" to see all houses.', 'c-wht'); }
        else if (args[0] === 'allegiance.txt') {
          if (pendingName && pendingHouse) { println(pendingName + ' of House ' + HOUSES[pendingHouse].display, 'c-gld'); }
          else { println('Your allegiance has not yet been sworn.', 'c-gld'); }
        }
        else { println('cat: ' + (args[0] || '') + ': No such file', 'c-red'); }
        break;
      case 'neofetch':  cmdNeofetch();  break;
      case 'history':
        if (!cmdHist.length) { println('(no history)', 'c-dim'); break; }
        cmdHist.slice().reverse().forEach(function (c, i) { println('  ' + (i + 1) + '  ' + c, 'c-wht'); });
        break;
      case 'ps':        println('  PID TTY      CMD\n 1337 pts/0   bash\n 9999 pts/0   lihammad-term', 'c-wht'); break;
      case 'free':      println('Mem: 64000MB total, 1337MB used, 60000MB free', 'c-wht'); break;
      case 'df':        println('/dev/sda1  500G  133G  367G  27%  /', 'c-wht'); break;
      case 'ifconfig':  println('eth0: inet 192.168.1.100  ether de:ad:be:ef:ca:fe', 'c-wht'); break;
      case 'sudo':      println('[sudo] password for ' + getUser() + ':\nSorry, no sudo privileges.', 'c-red'); break;
      case 'su':        println('su: Authentication failure. You are but a serf.', 'c-red'); break;
      case 'man':       println(args[0] ? 'No manual entry for ' + args[0] : 'What manual page do you want?', 'c-ylw'); break;
      case 'echo':      println(args.join(' '), 'c-wht'); break;
      case 'ping':      cmdPing(args); break;
      case 'wget':      cmdWget(args); break;
      case 'matrix':
      case 'cmatrix':   cmdMatrix(); break;
      case 'hack':      cmdHack(); break;
      case 'rickroll':  cmdRickroll(); break;
      case 'cowsay':    cmdCowsay(args); break;
      case 'figlet':
      case 'banner':    cmdFiglet(args); break;
      case 'sl':        cmdSl(); break;
      case 'whiterabbit':    cmdWhiteRabbit(); break;
      case 'consequences':   cmdConsequences(); break;
      case 'nmap': case 'hydra': case 'msfconsole': case 'hashcat':
      case 'john': case 'nikto': case 'gobuster': case 'sqlmap':
      case 'airmon-ng': case 'airodump-ng': case 'kismet':
        cmdFakehack(cmd, args);
        break;
      case 'dunkthelunk': cmdDunk(); break;
      default:
        println('bash: ' + esc(cmd) + ': command not found', 'c-red');
    }
    out.scrollTop = out.scrollHeight;
  }

  // =====================================================
  // COMMANDS
  // =====================================================
  function cmdSwear(args) {
    var houseKey = (args[0] || '').toLowerCase().replace(/^house-?/, '');
    if (houseKey === 'dunkthelunk') {
      println('That is not a house. Try a different approach...', 'c-ylw');
      return;
    }
    if (!houseKey) { println('Usage: swear-allegiance <house>', 'c-gld'); cmdHouses(); return; }
    if (!HOUSES[houseKey]) {
      println('"' + esc(args[0]) + '" is not a known house.', 'c-red');
      cmdHouses();
      return;
    }
    pendingHouse = houseKey;
    blank();
    println('You wish to swear allegiance to House ' + HOUSES[houseKey].display + '?', 'c-gld');
    println(HOUSES[houseKey].words, 'c-wht');
    blank();
    println('State your given name:', 'c-gld');
    awaitingName = true;
  }

  function cmdHouses() {
    blank();
    println('The Great Houses of Westeros:', 'c-gld');
    println('  targaryen   -- Fire and Blood',            'c-wht');
    println('  stark       -- Winter is Coming',          'c-wht');
    println('  lannister   -- Hear Me Roar',              'c-wht');
    println('  tyrell      -- Growing Strong',            'c-wht');
    println('  baratheon   -- Ours is the Fury',          'c-wht');
    println('  martell     -- Unbowed, Unbent, Unbroken', 'c-wht');
    println('  greyjoy     -- We Do Not Sow',             'c-wht');
    println('  arryn       -- As High as Honor',          'c-wht');
    println('  tully       -- Family, Duty, Honor',       'c-wht');
    blank();
    println('Usage: swear-allegiance <house>', 'c-dim');
    blank();
  }

  function cmdHelp() {
    blank();
    println('LIHAMMAD.COM TERMINAL', 'c-gld');
    println('-----------------------------------------', 'c-dim');
    println('[MAIN]', 'c-ylw');
    println('  swear-allegiance <house>  -- enter the site', 'c-wht');
    println('  houses                    -- list all houses', 'c-wht');
    println('  home / exit / logout      -- go to site',     'c-wht');
    println('  about                     -- about lihammad', 'c-wht');
    println('  clear / reboot / shutdown', 'c-wht');
    println('[SYSTEM]', 'c-ylw');
    println('  whoami / id / hostname / uname / date / uptime', 'c-wht');
    println('  pwd / ls / cat / ps / free / df / neofetch / history', 'c-wht');
    println('[NETWORK]', 'c-ylw');
    println('  ping / wget / ifconfig', 'c-wht');
    println('[HACKING TOOLS]', 'c-ylw');
    println('  nmap / msfconsole / hydra / hashcat / john', 'c-wht');
    println('  nikto / gobuster / sqlmap / airmon-ng / kismet', 'c-wht');
    println('[FUN]', 'c-ylw');
    println('  echo / cowsay / figlet / matrix / sl / hack / rickroll', 'c-wht');
    println('  whiterabbit / consequences', 'c-wht');
    blank();
  }

  function cmdAbout() {
    blank();
    println('  +==============================+', 'c-gld');
    println('  |    lihammad.com  //  v2.0    |', 'c-gld');
    println('  +==============================+', 'c-gld');
    println('  Site    : lihammad.com', 'c-wht');
    println('  Status  : online',       'c-grn');
    println('  Theme   : Game of Thrones', 'c-wht');
    blank();
  }

  function cmdNeofetch() {
    var lines = [
      ['', 'c-dim'],
      ['       *  *               ' + getUser() + '@kali', 'c-gld'],
      ['    /|  |\\              -----------------', 'c-gld'],
      ['   / |  | \\             OS: Westeros Linux', 'c-gld'],
      ['  /  |  |  \\            Shell: zsh 5.9', 'c-gld'],
      [' /   |  |   \\           Allegiance: ' + (pendingHouse ? HOUSES[pendingHouse].display : 'none yet'), 'c-gld'],
      ['/____|__|____\\          Vibe: immaculate', 'c-gld'],
      ['', 'c-dim']
    ];
    lines.forEach(function (l) { println(l[0], l[1]); });
  }

  function cmdPing(args) {
    var host = args[0] || 'google.com';
    println('PING ' + host, 'c-wht');
    lock();
    var c = 0;
    var iv = setInterval(function () {
      println('64 bytes from ' + host + ': icmp_seq=' + c + ' time=' + (Math.random() * 20 + 5).toFixed(1) + 'ms', 'c-grn');
      c++;
      if (c >= 4) { clearInterval(iv); println('4 packets transmitted, 0% loss', 'c-grn'); unlock(); }
    }, 600);
  }

  function cmdWget(args) {
    var url = args[0] || 'http://example.com';
    println('Connecting to ' + url, 'c-wht');
    lock();
    var p = 0;
    var iv = setInterval(function () {
      p = Math.min(p + Math.floor(Math.random() * 25 + 10), 100);
      var bar = '';
      for (var i = 0; i < 20; i++) bar += (i < Math.floor(p / 5) ? '#' : '.');
      println('[' + bar + '] ' + p + '%', 'c-grn');
      if (p >= 100) { clearInterval(iv); println('Download complete.', 'c-grn'); unlock(); }
    }, 280);
  }

  function cmdMatrix() {
    var KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    lock();
    var count = 0;
    var iv = setInterval(function () {
      var line = '';
      for (var i = 0; i < 60; i++) line += KATA[Math.floor(Math.random() * KATA.length)];
      println(line, 'c-grn');
      count++;
      if (count > 14) { clearInterval(iv); blank(); println('The ravens have spoken.', 'c-gld'); blank(); unlock(); }
    }, 75);
  }

  function cmdHack() {
    lock();
    seqPrint([
      ['', 'c-dim'],
      ['HACK THE SEVEN KINGDOMS!', 'c-grn'],
      ['', 'c-dim'],
      ['Accessing the Iron Throne mainframe...', 'c-wht'],
      ['[####################] Small Council bypassed', 'c-ylw'],
      ['[####################] The Wall firewall breached', 'c-ylw'],
      ['Access granted. You know nothing.', 'c-grn'],
      ['', 'c-dim']
    ], 180, unlock);
  }

  function cmdRickroll() {
    [['Never gonna give you up', 'c-ylw'],
     ['Never gonna let you down', 'c-ylw'],
     ['Never gonna run around and desert you', 'c-ylw'],
     ['You have been rickrolled.', 'c-gld'],
     ['', 'c-dim']
    ].forEach(function (l) { println(l[0], l[1]); });
  }

  function cmdCowsay(args) {
    var msg = args.join(' ') || 'moo';
    var bar = '-'.repeat(msg.length + 2);
    ['  ' + bar, '< ' + msg + ' >', '  ' + bar,
     '        \\   ^__^',
     '         \\  (oo)\\_______',
     '            (__)\\       )\\/\\',
     '                ||----w |',
     '                ||     ||'
    ].forEach(function (l) { println(l, 'c-wht'); });
  }

  function cmdFiglet(args) {
    var msg = (args.join(' ') || 'lihammad').toUpperCase();
    blank();
    println('  +' + '='.repeat(msg.length * 2 + 2) + '+', 'c-gld');
    println('  | ' + msg.split('').join(' ') + ' |', 'c-gld');
    println('  +' + '='.repeat(msg.length * 2 + 2) + '+', 'c-gld');
    blank();
  }

  function cmdSl() {
    lock();
    var f = [
      '        ====        ________',
      '    _D _|  |_______/        \\__I_I_____',
      '     |(_)---  |   H\\________/ |   |',
      '     /     |  |   H  |  |     |   |',
      '    | ________|___H__|_____/[][]~\\___|',
      '    |/ |   |-----------I_____I []  \\====|'
    ];
    f.forEach(function (l, i) { setTimeout(function () { println(l, 'c-ylw'); }, i * 90); });
    setTimeout(function () { println('choo choo!', 'c-wht'); blank(); unlock(); }, f.length * 90 + 200);
  }

  function cmdWhiteRabbit() {
    lock();
    seqPrint([
      ['', 'c-dim'], ['FOLLOW THE WHITE RABBIT', 'c-cyn'], ['---------------------', 'c-dim'],
      ['You stand at the edge of the rabbit hole.', 'c-wht'],
      ['A white rabbit with a pocket watch dashes past.', 'c-wht'], ['', 'c-dim'],
      ['> You follow.', 'c-wht'], ['The world tilts. You fall.', 'c-wht'], ['', 'c-dim'],
      ['You land in a strange hallway.', 'c-wht'],
      ['A tiny door. A bottle reads: DRINK ME.', 'c-wht'],
      ['> You drink it. You shrink.', 'c-wht'], ['', 'c-dim'],
      ['The door opens. Impossible colors.', 'c-wht'],
      ['You wake up. Or did you?', 'c-cyn'], ['', 'c-dim']
    ], 150, unlock);
  }

  function cmdConsequences() {
    lock();
    seqPrint([
      ['', 'c-dim'], ['CONSIDER THE CONSEQUENCES (1930)', 'c-cyn'], ['--------------------------------', 'c-dim'],
      ['[A young lord] met [a mysterious lady]', 'c-wht'],
      ['at [the end of the Kingsroad].', 'c-wht'], ['', 'c-dim'],
      ['He said: "I have sought you in every castle."', 'c-wht'],
      ['She said: "Winter is coming."', 'c-wht'], ['', 'c-dim'],
      ['The consequence: deployed to production on a Friday.', 'c-wht'], ['', 'c-dim'],
      ['The realm said: "skill issue."', 'c-wht'], ['', 'c-dim'],
      ['~ fin ~', 'c-cyn'], ['', 'c-dim']
    ], 160, unlock);
  }

  function cmdFakehack(tool, args) {
    var seqs = {
      nmap:        [['Starting Nmap 7.94', 'c-cyn'], ['Host is up (0.0042s latency)', 'c-wht'], ['22/tcp open ssh', 'c-grn'], ['80/tcp open http', 'c-grn'], ['443/tcp open https', 'c-grn'], ['Nmap done in 3.14s', 'c-grn']],
      hashcat:     [['hashcat (v6.2.6) starting...', 'c-cyn'], ['[####################] 100%', 'c-ylw'], ['5f4dcc3b:password', 'c-grn'], ['Session: complete', 'c-grn']],
      hydra:       [['Hydra v9.5 starting...', 'c-cyn'], ['[ATTEMPT] admin/admin', 'c-ylw'], ['[22][ssh] login: admin  pass: password123', 'c-grn'], ['1 valid password found', 'c-grn']],
      john:        [['John the Ripper 1.9.0', 'c-cyn'], ['Loaded 1 hash', 'c-wht'], ['password123  (hash)', 'c-grn'], ['1g DONE', 'c-grn']],
      nikto:       [['Nikto v2.1.6', 'c-cyn'], ['+ Server: Apache/2.4.54', 'c-wht'], ['+ /admin/: found', 'c-ylw'], ['+ 4 items reported', 'c-grn']],
      gobuster:    [['Gobuster v3.6', 'c-cyn'], ['/index.html (200)', 'c-grn'], ['/admin (403)', 'c-ylw'], ['Finished', 'c-grn']],
      sqlmap:      [['sqlmap v1.7.11', 'c-cyn'], ['Testing connection...', 'c-wht'], ['GET param injectable', 'c-grn'], ['Run ended', 'c-grn']],
      'airmon-ng': [['Found wlan0', 'c-cyn'], ['Monitor mode enabled on wlan0mon', 'c-grn']],
      'airodump-ng': [['Scanning...', 'c-cyn'], ['lihammad-net  DE:AD:BE:EF:CA:FE  -30dBm', 'c-grn']],
      kismet:      [['Kismet v2024-01', 'c-cyn'], ['Found: lihammad-net', 'c-grn'], ['Total: 2 networks', 'c-grn']],
      msfconsole:  [['', 'c-dim'], ['      .:okOOOkdc.', 'c-red'], ['    .xOOOOOOOOOOOx.', 'c-red'], ['   :OOOOOOOOOOOOOOo:', 'c-red'], ['  =[ metasploit v6.3.44-dev ]', 'c-cyn'], ['+ -- --=[ 2376 exploits ]', 'c-wht'], ['', 'c-dim'], ['msf6 > ', 'c-grn']]
    };
    var seq = seqs[tool] || [['Running ' + tool + '...', 'c-cyn'], ['Done.', 'c-grn']];
    lock();
    if (tool === 'msfconsole') {
      seqPrint(seq, 80, function () {
        setTimeout(function () { println('msf6 > exit', 'c-wht'); println('[*] Quitting Metasploit...', 'c-ylw'); setTimeout(unlock, 500); }, 1000);
      });
    } else {
      seqPrint(seq, 180, unlock);
    }
  }

  function cmdDunk() {
    lock();
    seqPrint([
      ['', 'c-dim'],
      ['...', 'c-wht'],
      ['...a hedge knight approaches the gate.', 'c-wht'],
      ['', 'c-dim'],
      ['The gate guard squints.', 'c-wht'],
      ['"Name and house?"', 'c-ylw'],
      ['', 'c-dim'],
      ['"Duncan. Just... Duncan."', 'c-gld'],
      ['', 'c-dim'],
      ['The guard shrugs and waves you through.', 'c-wht'],
      ['', 'c-dim'],
      ['Entering as Ser Duncan the Tall...', 'c-gld']
    ], 160, function () {
      pendingHouse = 'dunkthelunk';
      pendingName  = 'Duncan the Tall';
      setTimeout(function () { goSite('dunkthelunk', 'Duncan the Tall'); }, 600);
      unlock();
    });
  }

  // =====================================================
  // BOOT
  // =====================================================

  function boot() {
    updatePromptUI();
    var startMsg = (pendingName && pendingHouse)
      ? '[ OK ] Starting ' + getUser() + ' terminal...'
      : '[ OK ] Starting serf terminal...';

    var welcomeLines = (pendingName && pendingHouse)
      ? [
          ['  Welcome back, ' + pendingName + ' of House ' + HOUSES[pendingHouse].display + '.', 'c-gld'],
          ['  ' + HOUSES[pendingHouse].words, 'c-wht'],
          ['  Type "home" to return to the site.', 'c-wht'],
          ['', 'c-dim']
        ]
      : [
          ['  You are a serf at the gates of lihammad.com.', 'c-wht'],
          ['  Swear allegiance to enter. Type "help" for commands.', 'c-wht'],
          ['  Type "houses" to see the Great Houses.', 'c-wht'],
          ['', 'c-dim']
        ];

    var lines = [
      ['Linux kali 6.1.0 #1 SMP PREEMPT_DYNAMIC', 'c-grn'],
      ['', 'c-dim'],
      [startMsg, 'c-wht'],
      ['[ OK ] Loading the Maester records...', 'c-wht'],
      ['[ OK ] Consulting the ravens...', 'c-wht'],
      ['', 'c-dim'],
      ['  _    _  _  _  ___  _  _  _  ___  _  _ __    ___', 'c-gld'],
      [' | |  | || || ||   || |  | || ||   || \| | \ \  _/', 'c-gld'],
      [' | |__| || || || O || |__| || || O ||  ` |  \ \ |_ ', 'c-gld'],
      [' |____|_||_||_||___||____||_||_||___||_|\_|___\/___/', 'c-gld'],
      ['', 'c-dim'],
      ['   ___  ___  __   _   _  _  _', 'c-gld'],
      ['  |  _||_  ||  | | | | || \| |', 'c-gld'],
      ['  |_|_| _| ||__| |_| |_||_|\_|', 'c-gld'],
    ].concat(welcomeLines);

    var i = 0;
    function next() {
      if (i < lines.length) { println(lines[i][0], lines[i][1]); i++; setTimeout(next, 48); }
    }
    next();
  }

  function runCmd(raw) {
    var trimmed = raw.trim();
    echoPrompt(raw);
    if (!trimmed) return;
    cmdHist.unshift(trimmed);
    histIdx = -1;

    var parts = trimmed.split(/\s+/);
    var cmd   = parts[0].toLowerCase();
    var args  = parts.slice(1);

    // house selection
    if (cmd === 'swear-allegiance' || cmd === 'swear') { cmdSwear(args); return; }

    if (cmd === 'home') {
      if (pendingName && pendingHouse) {
        println('Returning to ' + pendingName + ' of House ' + HOUSES[pendingHouse].display + '...', 'c-gld');
        setTimeout(function () { goSite(pendingHouse, pendingName); }, 600);
      } else {
        println('You must first swear allegiance to a house.', 'c-gld');
        println('Type: swear-allegiance <house>', 'c-wht');
        println('e.g.: swear-allegiance targaryen', 'c-dim');
      }
      return;
    }

    switch (cmd) {
      case 'help':        cmdHelp();            break;
      case 'houses':      cmdHouses();          break;
      case 'clear':       out.innerHTML = '';   break;
      case 'about':       cmdAbout();           break;
      case 'reboot':
        println('Rebooting...', 'c-ylw');
        setTimeout(function () { out.innerHTML = ''; boot(); }, 900);
        break;
      case 'shutdown':
        println('Shutting down...', 'c-ylw');
        lock();
        setTimeout(function () {
          out.style.opacity = '0';
          setTimeout(function () { out.innerHTML = ''; out.style.opacity = '1'; unlock(); }, 900);
        }, 800);
        break;
      case 'exit':
      case 'logout':
        if (pendingName && pendingHouse) {
          println('Returning to ' + pendingName + ' of House ' + HOUSES[pendingHouse].display + '...', 'c-gld');
          setTimeout(function () { goSite(pendingHouse, pendingName); }, 600);
        } else {
          println('You cannot leave until you swear allegiance.', 'c-gld');
          cmdHouses();
        }
        break;
      // system
      case 'whoami':    println(getUser(), 'c-grn'); break;
      case 'id':        println('uid=0(' + getUser() + ') gid=0 groups=0,999(smallfolk)', 'c-wht'); break;
      case 'hostname':  println('kali', 'c-wht'); break;
      case 'uname':     println(args.indexOf('-a') !== -1 ? 'Linux kali 6.1.0 #1 SMP x86_64 Westeros/GNU' : 'Linux', 'c-wht'); break;
      case 'date':      println(new Date().toString(), 'c-wht'); break;
      case 'uptime':    println('up ' + (Math.floor(Math.random() * 99) + 1) + ' days, the realm endures', 'c-wht'); break;
      case 'pwd':       println('/home/' + getUser(), 'c-wht'); break;
      case 'ls':        println('readme.txt    allegiance.txt    lihammad.com/', 'c-wht'); break;
      case 'cat':
        if (args[0] === 'readme.txt')      { println('LIHAMMAD TERMINAL\nSwear allegiance to a house to enter.\nType "houses" to see all houses.', 'c-wht'); }
        else if (args[0] === 'allegiance.txt') {
          if (pendingName && pendingHouse) { println(pendingName + ' of House ' + HOUSES[pendingHouse].display, 'c-gld'); }
          else { println('Your allegiance has not yet been sworn.', 'c-gld'); }
        }
        else { println('cat: ' + (args[0] || '') + ': No such file', 'c-red'); }
        break;
      case 'neofetch':  cmdNeofetch();  break;
      case 'history':
        if (!cmdHist.length) { println('(no history)', 'c-dim'); break; }
        cmdHist.slice().reverse().forEach(function (c, i) { println('  ' + (i + 1) + '  ' + c, 'c-wht'); });
        break;
      case 'ps':        println('  PID TTY      CMD\n 1337 pts/0   bash\n 9999 pts/0   lihammad-term', 'c-wht'); break;
      case 'free':      println('Mem: 64000MB total, 1337MB used, 60000MB free', 'c-wht'); break;
      case 'df':        println('/dev/sda1  500G  133G  367G  27%  /', 'c-wht'); break;
      case 'ifconfig':  println('eth0: inet 192.168.1.100  ether de:ad:be:ef:ca:fe', 'c-wht'); break;
      case 'sudo':      println('[sudo] password for ' + getUser() + ':\nSorry, no sudo privileges.', 'c-red'); break;
      case 'su':        println('su: Authentication failure. You are but a serf.', 'c-red'); break;
      case 'man':       println(args[0] ? 'No manual entry for ' + args[0] : 'What manual page do you want?', 'c-ylw'); break;
      case 'echo':      println(args.join(' '), 'c-wht'); break;
      case 'ping':      cmdPing(args); break;
      case 'wget':      cmdWget(args); break;
      case 'matrix':
      case 'cmatrix':   cmdMatrix(); break;
      case 'hack':      cmdHack(); break;
      case 'rickroll':  cmdRickroll(); break;
      case 'cowsay':    cmdCowsay(args); break;
      case 'figlet':
      case 'banner':    cmdFiglet(args); break;
      case 'sl':        cmdSl(); break;
      case 'whiterabbit':    cmdWhiteRabbit(); break;
      case 'consequences':   cmdConsequences(); break;
      case 'nmap': case 'hydra': case 'msfconsole': case 'hashcat':
      case 'john': case 'nikto': case 'gobuster': case 'sqlmap':
      case 'airmon-ng': case 'airodump-ng': case 'kismet':
        cmdFakehack(cmd, args);
        break;
      case 'dunkthelunk': cmdDunk(); break;
      default:
        println('bash: ' + esc(cmd) + ': command not found', 'c-red');
    }
    out.scrollTop = out.scrollHeight;
  }

  // =====================================================
  // COMMANDS
  // =====================================================
  function cmdSwear(args) {
    var houseKey = (args[0] || '').toLowerCase().replace(/^house-?/, '');
    if (houseKey === 'dunkthelunk') {
      println('That is not a house. Try a different approach...', 'c-ylw');
      return;
    }
    if (!houseKey) { println('Usage: swear-allegiance <house>', 'c-gld'); cmdHouses(); return; }
    if (!HOUSES[houseKey]) {
      println('"' + esc(args[0]) + '" is not a known house.', 'c-red');
      cmdHouses();
      return;
    }
    pendingHouse = houseKey;
    blank();
    println('You wish to swear allegiance to House ' + HOUSES[houseKey].display + '?', 'c-gld');
    println(HOUSES[houseKey].words, 'c-wht');
    blank();
    println('State your given name:', 'c-gld');
    awaitingName = true;
  }

  function cmdHouses() {
    blank();
    println('The Great Houses of Westeros:', 'c-gld');
    println('  targaryen   -- Fire and Blood',            'c-wht');
    println('  stark       -- Winter is Coming',          'c-wht');
    println('  lannister   -- Hear Me Roar',              'c-wht');
    println('  tyrell      -- Growing Strong',            'c-wht');
    println('  baratheon   -- Ours is the Fury',          'c-wht');
    println('  martell     -- Unbowed, Unbent, Unbroken', 'c-wht');
    println('  greyjoy     -- We Do Not Sow',             'c-wht');
    println('  arryn       -- As High as Honor',          'c-wht');
    println('  tully       -- Family, Duty, Honor',       'c-wht');
    blank();
    println('Usage: swear-allegiance <house>', 'c-dim');
    blank();
  }

  function cmdHelp() {
    blank();
    println('LIHAMMAD.COM TERMINAL', 'c-gld');
    println('-----------------------------------------', 'c-dim');
    println('[MAIN]', 'c-ylw');
    println('  swear-allegiance <house>  -- enter the site', 'c-wht');
    println('  houses                    -- list all houses', 'c-wht');
    println('  home / exit / logout      -- go to site',     'c-wht');
    println('  about                     -- about lihammad', 'c-wht');
    println('  clear / reboot / shutdown', 'c-wht');
    println('[SYSTEM]', 'c-ylw');
    println('  whoami / id / hostname / uname / date / uptime', 'c-wht');
    println('  pwd / ls / cat / ps / free / df / neofetch / history', 'c-wht');
    println('[NETWORK]', 'c-ylw');
    println('  ping / wget / ifconfig', 'c-wht');
    println('[HACKING TOOLS]', 'c-ylw');
    println('  nmap / msfconsole / hydra / hashcat / john', 'c-wht');
    println('  nikto / gobuster / sqlmap / airmon-ng / kismet', 'c-wht');
    println('[FUN]', 'c-ylw');
    println('  echo / cowsay / figlet / matrix / sl / hack / rickroll', 'c-wht');
    println('  whiterabbit / consequences', 'c-wht');
    blank();
  }

  function cmdAbout() {
    blank();
    println('  +==============================+', 'c-gld');
    println('  |    lihammad.com  //  v2.0    |', 'c-gld');
    println('  +==============================+', 'c-gld');
    println('  Site    : lihammad.com', 'c-wht');
    println('  Status  : online',       'c-grn');
    println('  Theme   : Game of Thrones', 'c-wht');
    blank();
  }

  function cmdNeofetch() {
    var lines = [
      ['', 'c-dim'],
      ['       *  *               ' + getUser() + '@kali', 'c-gld'],
      ['    /|  |\\              -----------------', 'c-gld'],
      ['   / |  | \\             OS: Westeros Linux', 'c-gld'],
      ['  /  |  |  \\            Shell: zsh 5.9', 'c-gld'],
      [' /   |  |   \\           Allegiance: ' + (pendingHouse ? HOUSES[pendingHouse].display : 'none yet'), 'c-gld'],
      ['/____|__|____\\          Vibe: immaculate', 'c-gld'],
      ['', 'c-dim']
    ];
    lines.forEach(function (l) { println(l[0], l[1]); });
  }

  function cmdPing(args) {
    var host = args[0] || 'google.com';
    println('PING ' + host, 'c-wht');
    lock();
    var c = 0;
    var iv = setInterval(function () {
      println('64 bytes from ' + host + ': icmp_seq=' + c + ' time=' + (Math.random() * 20 + 5).toFixed(1) + 'ms', 'c-grn');
      c++;
      if (c >= 4) { clearInterval(iv); println('4 packets transmitted, 0% loss', 'c-grn'); unlock(); }
    }, 600);
  }

  function cmdWget(args) {
    var url = args[0] || 'http://example.com';
    println('Connecting to ' + url, 'c-wht');
    lock();
    var p = 0;
    var iv = setInterval(function () {
      p = Math.min(p + Math.floor(Math.random() * 25 + 10), 100);
      var bar = '';
      for (var i = 0; i < 20; i++) bar += (i < Math.floor(p / 5) ? '#' : '.');
      println('[' + bar + '] ' + p + '%', 'c-grn');
      if (p >= 100) { clearInterval(iv); println('Download complete.', 'c-grn'); unlock(); }
    }, 280);
  }

  function cmdMatrix() {
    var KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    lock();
    var count = 0;
    var iv = setInterval(function () {
      var line = '';
      for (var i = 0; i < 60; i++) line += KATA[Math.floor(Math.random() * KATA.length)];
      println(line, 'c-grn');
      count++;
      if (count > 14) { clearInterval(iv); blank(); println('The ravens have spoken.', 'c-gld'); blank(); unlock(); }
    }, 75);
  }

  function cmdHack() {
    lock();
    seqPrint([
      ['', 'c-dim'],
      ['HACK THE SEVEN KINGDOMS!', 'c-grn'],
      ['', 'c-dim'],
      ['Accessing the Iron Throne mainframe...', 'c-wht'],
      ['[####################] Small Council bypassed', 'c-ylw'],
      ['[####################] The Wall firewall breached', 'c-ylw'],
      ['Access granted. You know nothing.', 'c-grn'],
      ['', 'c-dim']
    ], 180, unlock);
  }

  function cmdRickroll() {
    [['Never gonna give you up', 'c-ylw'],
     ['Never gonna let you down', 'c-ylw'],
     ['Never gonna run around and desert you', 'c-ylw'],
     ['You have been rickrolled.', 'c-gld'],
     ['', 'c-dim']
    ].forEach(function (l) { println(l[0], l[1]); });
  }

  function cmdCowsay(args) {
    var msg = args.join(' ') || 'moo';
    var bar = '-'.repeat(msg.length + 2);
    ['  ' + bar, '< ' + msg + ' >', '  ' + bar,
     '        \\   ^__^',
     '         \\  (oo)\\_______',
     '            (__)\\       )\\/\\',
     '                ||----w |',
     '                ||     ||'
    ].forEach(function (l) { println(l, 'c-wht'); });
  }

  function cmdFiglet(args) {
    var msg = (args.join(' ') || 'lihammad').toUpperCase();
    blank();
    println('  +' + '='.repeat(msg.length * 2 + 2) + '+', 'c-gld');
    println('  | ' + msg.split('').join(' ') + ' |', 'c-gld');
    println('  +' + '='.repeat(msg.length * 2 + 2) + '+', 'c-gld');
    blank();
  }

  function cmdSl() {
    lock();
    var f = [
      '        ====        ________',
      '    _D _|  |_______/        \\__I_I_____',
      '     |(_)---  |   H\\________/ |   |',
      '     /     |  |   H  |  |     |   |',
      '    | ________|___H__|_____/[][]~\\___|',
      '    |/ |   |-----------I_____I []  \\====|'
    ];
    f.forEach(function (l, i) { setTimeout(function () { println(l, 'c-ylw'); }, i * 90); });
    setTimeout(function () { println('choo choo!', 'c-wht'); blank(); unlock(); }, f.length * 90 + 200);
  }

  function cmdWhiteRabbit() {
    lock();
    seqPrint([
      ['', 'c-dim'], ['FOLLOW THE WHITE RABBIT', 'c-cyn'], ['---------------------', 'c-dim'],
      ['You stand at the edge of the rabbit hole.', 'c-wht'],
      ['A white rabbit with a pocket watch dashes past.', 'c-wht'], ['', 'c-dim'],
      ['> You follow.', 'c-wht'], ['The world tilts. You fall.', 'c-wht'], ['', 'c-dim'],
      ['You land in a strange hallway.', 'c-wht'],
      ['A tiny door. A bottle reads: DRINK ME.', 'c-wht'],
      ['> You drink it. You shrink.', 'c-wht'], ['', 'c-dim'],
      ['The door opens. Impossible colors.', 'c-wht'],
      ['You wake up. Or did you?', 'c-cyn'], ['', 'c-dim']
    ], 150, unlock);
  }

  function cmdConsequences() {
    lock();
    seqPrint([
      ['', 'c-dim'], ['CONSIDER THE CONSEQUENCES (1930)', 'c-cyn'], ['--------------------------------', 'c-dim'],
      ['[A young lord] met [a mysterious lady]', 'c-wht'],
      ['at [the end of the Kingsroad].', 'c-wht'], ['', 'c-dim'],
      ['He said: "I have sought you in every castle."', 'c-wht'],
      ['She said: "Winter is coming."', 'c-wht'], ['', 'c-dim'],
      ['The consequence: deployed to production on a Friday.', 'c-wht'], ['', 'c-dim'],
      ['The realm said: "skill issue."', 'c-wht'], ['', 'c-dim'],
      ['~ fin ~', 'c-cyn'], ['', 'c-dim']
    ], 160, unlock);
  }

  function cmdFakehack(tool, args) {
    var seqs = {
      nmap:        [['Starting Nmap 7.94', 'c-cyn'], ['Host is up (0.0042s latency)', 'c-wht'], ['22/tcp open ssh', 'c-grn'], ['80/tcp open http', 'c-grn'], ['443/tcp open https', 'c-grn'], ['Nmap done in 3.14s', 'c-grn']],
      hashcat:     [['hashcat (v6.2.6) starting...', 'c-cyn'], ['[####################] 100%', 'c-ylw'], ['5f4dcc3b:password', 'c-grn'], ['Session: complete', 'c-grn']],
      hydra:       [['Hydra v9.5 starting...', 'c-cyn'], ['[ATTEMPT] admin/admin', 'c-ylw'], ['[22][ssh] login: admin  pass: password123', 'c-grn'], ['1 valid password found', 'c-grn']],
      john:        [['John the Ripper 1.9.0', 'c-cyn'], ['Loaded 1 hash', 'c-wht'], ['password123  (hash)', 'c-grn'], ['1g DONE', 'c-grn']],
      nikto:       [['Nikto v2.1.6', 'c-cyn'], ['+ Server: Apache/2.4.54', 'c-wht'], ['+ /admin/: found', 'c-ylw'], ['+ 4 items reported', 'c-grn']],
      gobuster:    [['Gobuster v3.6', 'c-cyn'], ['/index.html (200)', 'c-grn'], ['/admin (403)', 'c-ylw'], ['Finished', 'c-grn']],
      sqlmap:      [['sqlmap v1.7.11', 'c-cyn'], ['Testing connection...', 'c-wht'], ['GET param injectable', 'c-grn'], ['Run ended', 'c-grn']],
      'airmon-ng': [['Found wlan0', 'c-cyn'], ['Monitor mode enabled on wlan0mon', 'c-grn']],
      'airodump-ng': [['Scanning...', 'c-cyn'], ['lihammad-net  DE:AD:BE:EF:CA:FE  -30dBm', 'c-grn']],
      kismet:      [['Kismet v2024-01', 'c-cyn'], ['Found: lihammad-net', 'c-grn'], ['Total: 2 networks', 'c-grn']],
      msfconsole:  [['', 'c-dim'], ['      .:okOOOkdc.', 'c-red'], ['    .xOOOOOOOOOOOx.', 'c-red'], ['   :OOOOOOOOOOOOOOo:', 'c-red'], ['  =[ metasploit v6.3.44-dev ]', 'c-cyn'], ['+ -- --=[ 2376 exploits ]', 'c-wht'], ['', 'c-dim'], ['msf6 > ', 'c-grn']]
    };
    var seq = seqs[tool] || [['Running ' + tool + '...', 'c-cyn'], ['Done.', 'c-grn']];
    lock();
    if (tool === 'msfconsole') {
      seqPrint(seq, 80, function () {
        setTimeout(function () { println('msf6 > exit', 'c-wht'); println('[*] Quitting Metasploit...', 'c-ylw'); setTimeout(unlock, 500); }, 1000);
      });
    } else {
      seqPrint(seq, 180, unlock);
    }
  }

  function cmdDunk() {
    lock();
    seqPrint([
      ['', 'c-dim'],
      ['...', 'c-wht'],
      ['...a hedge knight approaches the gate.', 'c-wht'],
      ['', 'c-dim'],
      ['The gate guard squints.', 'c-wht'],
      ['"Name and house?"', 'c-ylw'],
      ['', 'c-dim'],
      ['"Duncan. Just... Duncan."', 'c-gld'],
      ['', 'c-dim'],
      ['The guard shrugs and waves you through.', 'c-wht'],
      ['', 'c-dim'],
      ['Entering as Ser Duncan the Tall...', 'c-gld']
    ], 160, function () {
      pendingHouse = 'dunkthelunk';
      pendingName  = 'Duncan the Tall';
      setTimeout(function () { goSite('dunkthelunk', 'Duncan the Tall'); }, 600);
      unlock();
    });
  }

  // =====================================================
  // BOOT
  // =====================================================
  function boot() {
    updatePromptUI();
    var startMsg = (pendingName && pendingHouse)
      ? '[ OK ] Starting ' + getUser() + ' terminal...'
      : '[ OK ] Starting serf terminal...';

    var welcomeLines = (pendingName && pendingHouse)
      ? [
          ['  Welcome back, ' + pendingName + ' of House ' + HOUSES[pendingHouse].display + '.', 'c-gld'],
          ['  ' + HOUSES[pendingHouse].words, 'c-wht'],
          ['  Type "home" to return to the site.', 'c-wht'],
          ['', 'c-dim']
        ]
      : [
          ['  You are a serf at the gates of lihammad.com.', 'c-wht'],
          ['  Swear allegiance to enter. Type "help" for commands.', 'c-wht'],
          ['  Type "houses" to see the Great Houses.', 'c-wht'],
          ['', 'c-dim']
        ];

    var lines = [
      ['Linux kali 6.1.0 #1 SMP PREEMPT_DYNAMIC', 'c-grn'],
      ['', 'c-dim'],
      [startMsg, 'c-wht'],
      ['[ OK ] Loading the Maester records...', 'c-wht'],
      ['[ OK ] Consulting the ravens...', 'c-wht'],
      ['', 'c-dim'],
      ['  _    _  _  _  ___  _  _  _  ___  _  _ __    ___', 'c-gld'],
      [' | |  | || || ||   || |  | || ||   || \| | \ \  _/', 'c-gld'],
      [' | |__| || || || O || |__| || || O ||  ` |  \ \ |_ ', 'c-gld'],
      [' |____|_||_||_||___||____||_||_||___||_|\_|___\/___/', 'c-gld'],
      ['', 'c-dim'],
      ['   ___  ___  __   _   _  _  _', 'c-gld'],
      ['  |  _||_  ||  | | | | || \| |', 'c-gld'],
      ['  |_|_| _| ||__| |_| |_||_|\_|', 'c-gld'],
    ].concat(welcomeLines);

    var i = 0;
    function next() {
      if (i < lines.length) { println(lines[i][0], lines[i][1]); i++; setTimeout(next, 48); }
    }
    next();
  }

  // ── Transitions ──
  function goSite(house, name) {
    var term = termEl;
    term.style.transition = 'opacity 0.7s';
    term.style.opacity = '0';
    setTimeout(function() {
      term.classList.remove('active');
      term.style.opacity = '';
      term.style.transition = '';

      pendingHouse = house;
      pendingName  = name;
      var sc = SHIELD_COLORS[house] || SHIELD_COLORS.targaryen;

      // Apply house theme
      document.documentElement.style.setProperty('--house-bg',     sc.bg);
      document.documentElement.style.setProperty('--house-border',  sc.border);
      document.documentElement.style.setProperty('--house-c1',      sc.c1);
      document.body.style.background = 'radial-gradient(ellipse at 50% 30%, ' + sc.bg + ' 0%, #050402 70%)';

      // Update hero text
      var nameEl  = $id('hero-name');
      var houseEl = $id('hero-house');
      var wordsEl = $id('hero-words');
      if (nameEl)  nameEl.textContent  = name;
      if (houseEl) houseEl.textContent = 'of House ' + HOUSES[house].display;
      if (wordsEl) wordsEl.textContent  = HOUSES[house].words;

      // Set shield sigil + bg
      var img = $id('house-shield-img');
      var bg  = $id('shield-bg');
      if (img) img.setAttribute('href', SIGILS[house] || '');
      if (bg)  bg.setAttribute('fill', sc.bg);

      // Particles
      spawnParticles(house);

    }, 700);
  }

  function goTerminal() {
    if (!termEl) return;
    termEl.classList.add('active');
    updatePromptUI();
    setTimeout(function() {
      if (inputEl) inputEl.focus();
    }, 100);
    if (outputEl && outputEl.children.length === 0) boot();
  }

  // ── Particles ──
  function spawnParticles(house) {
    var container = $id('hero-particles');
    if (!container) return;
    container.innerHTML = '';
    var type = (HOUSES[house] || {}).particles;
    if (type === 'ember') {
      for (var i = 0; i < 12; i++) {
        var e = document.createElement('div');
        e.className = 'ember';
        e.style.left = Math.random() * 100 + '%';
        e.style.animationDuration = (4 + Math.random() * 5) + 's';
        e.style.animationDelay    = (Math.random() * 6) + 's';
        e.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
        container.appendChild(e);
      }
    } else if (type === 'snow') {
      for (var j = 0; j < 18; j++) {
        var s = document.createElement('div');
        s.className = 'snowflake';
        s.textContent = '❄';
        s.style.left = Math.random() * 100 + '%';
        s.style.fontSize = (8 + Math.random() * 10) + 'px';
        s.style.animationDuration = (6 + Math.random() * 8) + 's';
        s.style.animationDelay    = (Math.random() * 8) + 's';
        s.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
        container.appendChild(s);
      }
    }
  }

  // ── Cannon ──
  function knockShield() {
    var cannon = $id('cannon-wrap');
    var ball   = $id('cannonball');
    var flash  = $id('muzzle-flash');
    var hero   = $id('hero-section');
    var hc     = $id('shield-hole-circle');
    var hr     = $id('shield-hole-ring');
    var cracks = $id('shield-cracks');
    if (!cannon || cannon.dataset.firing === '1') return;
    cannon.dataset.firing = '1';

    cannon.style.animation = ball.style.animation = flash.style.animation = 'none';
    cannon.style.opacity = '0';
    cannon.style.transform = 'translateX(120px)';
    ball.style.opacity = '0';
    flash.style.opacity = '0'; flash.style.transform = 'scale(0)';
    if (hc) { hc.setAttribute('r','0'); hc.setAttribute('opacity','0'); }
    if (hr) { hr.setAttribute('r','0'); hr.setAttribute('stroke-width','0'); }
    if (cracks) cracks.setAttribute('opacity','0');
    void cannon.offsetWidth;

    cannon.style.animation = 'cannonRollIn 0.65s cubic-bezier(0.2,0.8,0.4,1) forwards';

    setTimeout(function() {
      cannon.style.animation = 'cannonRecoil 0.45s ease forwards';
      flash.style.animation  = 'muzzleFlash 0.3s ease forwards';
      ball.style.opacity = '1';
      ball.style.animation = 'ballFly 0.42s ease-in forwards';
    }, 950);

    setTimeout(function() {
      cannon.style.animation = 'none';
      cannon.style.opacity   = '1';
      cannon.style.transform = 'translateX(0)';
    }, 1500);

    setTimeout(function() {
      if (hero) { hero.classList.add('hero-shaking'); setTimeout(function(){hero.classList.remove('hero-shaking');},500); }
      if (hc) hc.setAttribute('opacity','1');
      var r=0, grow=setInterval(function(){
        r=Math.min(r+2.5,26);
        if(hc)hc.setAttribute('r',r);
        if(hr){hr.setAttribute('r',r+8);hr.setAttribute('stroke-width','5');}
        if(r>=26)clearInterval(grow);
      },12);
      if(cracks) cracks.setAttribute('opacity','1');
    }, 1330);

    setTimeout(function() {
      cannon.style.animation = 'cannonRollOut 0.65s ease forwards';
    }, 2300);

    setTimeout(function() {
      var r=26, shrink=setInterval(function(){
        r-=0.55; var op=Math.max(0,r/26);
        if(hc){hc.setAttribute('r',Math.max(0,r));hc.setAttribute('opacity',op);}
        if(hr){hr.setAttribute('r',Math.max(0,r+8));hr.setAttribute('opacity',op*0.7);}
        if(cracks)cracks.setAttribute('opacity',op);
        if(r<=0){clearInterval(shrink);if(hr)hr.setAttribute('stroke-width','0');cannon.dataset.firing='0';}
      },18);
    }, 5000);
  }

  // ── Expose globals ──
  window.knockShield    = knockShield;
  window.goTerminal     = goTerminal;
  window.goSite         = goSite;
  window._closeTerminal = function() {
    if (pendingHouse) {
      goSite(pendingHouse, pendingName || 'Stranger');
    } else {
      termEl.classList.remove('active');
    }
  };

  // ── Init: open terminal by default if no allegiance ──
  function init() {
    // ── Wire up DOM refs now that DOM is ready ──
    termEl    = $id('terminal');
    outputEl  = $id('term-output');
    inputEl   = $id('term-input');
    promptLbl = $id('term-prompt');
    titleBar  = $id('term-title');
    matCanvas = $id('matrix-canvas');
    out       = outputEl;
    inp       = inputEl;

    // ── Input handling ──
    if (inp) {
      inp.addEventListener('keydown', function(e) {
        if (inputLocked) return;
        if (e.key === 'Enter') {
          var v = inp.value.trim();
          inp.value = '';
          if (awaitingName) { handleNameInput(v); }
          else              { runCmd(v); }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (historyIdx < cmdHistory.length - 1) {
            historyIdx++;
            inp.value = cmdHistory[cmdHistory.length - 1 - historyIdx];
          }
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (historyIdx > 0) {
            historyIdx--;
            inp.value = cmdHistory[cmdHistory.length - 1 - historyIdx];
          } else {
            historyIdx = -1;
            inp.value = '';
          }
        }
      });
    }

    // Click anywhere to focus input
    document.addEventListener('click', function() {
      if (termEl && termEl.classList.contains('active') && inp) inp.focus();
    });

    // Nav scroll effect
    var nav = document.querySelector('.got-nav');
    if (nav) {
      window.addEventListener('scroll', function() {
        nav.classList.toggle('scrolled', window.scrollY > 40);
      });
    }

    // Open terminal on load
    goTerminal();
  }

  // Run init immediately if DOM ready, otherwise wait
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
