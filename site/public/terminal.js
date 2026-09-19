(() => {
  const form = document.querySelector('[data-terminal-form]');
  const input = document.querySelector('#terminal-command');
  const output = document.querySelector('[data-terminal-output]');
  const posts = [...document.querySelectorAll('[data-post-link]')];
  if (!form || !input || !output) return;

  const prompt = 'guest@brave-new-code:~$';

  function write(lines, className = '') {
    for (const line of lines) {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      if (className) paragraph.className = className;
      output.append(paragraph);
    }
    output.scrollTop = output.scrollHeight;
  }

  function listPosts() {
    if (!posts.length) return ['No posts mounted.'];
    return posts.map((post, index) => `${String(index + 1).padStart(2, '0')}  ${post.textContent.trim()}`);
  }

  function listTags() {
    const tags = new Set();
    for (const post of posts) {
      for (const tag of post.parentElement?.querySelector('.terminal-post-meta')?.textContent.split(' · ') ?? []) {
        if (tag) tags.add(tag.trim());
      }
    }
    return tags.size ? [...tags].sort() : ['No tags mounted.'];
  }

  function execute(rawCommand) {
    const raw = rawCommand.trim();
    if (!raw) return;

    write([`${prompt} ${raw}`], 'terminal-command');
    const [command, ...args] = raw.split(/\s+/);
    const normalized = command.toLowerCase();

    switch (normalized) {
      case 'help':
        write([
          'available commands:',
          '  list              list mounted posts',
          '  open <number>     open a post in the editorial view',
          '  tags              list known topics',
          '  about             show the session identity',
          '  clear             clear terminal output',
          '  exit              return to the editorial site',
        ]);
        break;
      case 'list':
      case 'ls':
      case 'posts':
        write(listPosts());
        break;
      case 'tags':
        write(['known topics:', ...listTags().map((tag) => `  ${tag}`)]);
        break;
      case 'about':
        write([
          'BRAVE NEW CODE',
          'notes on software, AI, cloud, and the systems we build.',
          'read-only mode: enabled',
        ]);
        break;
      case 'open': {
        const index = Number(args[0]) - 1;
        const post = Number.isInteger(index) ? posts[index] : undefined;
        if (post) {
          window.location.href = post.href;
        } else {
          write([`open: post ${args[0] ?? '(missing)'} not found. Try list.`], 'terminal-error');
        }
        break;
      }
      case 'clear':
        output.replaceChildren();
        break;
      case 'exit':
      case 'quit':
        window.location.href = '/';
        break;
      case 'ssh':
        write(['you are already connected.', 'This is a read-only browser session.'], 'terminal-success');
        break;
      default:
        write([`${command}: command not found. Try help.`], 'terminal-error');
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    execute(input.value);
    input.value = '';
  });

  document.addEventListener('click', () => input.focus());
  input.focus();
})();
