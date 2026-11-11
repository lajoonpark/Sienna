// Settings > Account: parsing YouTube Music's account menu and accounts list (electron/ytm-parse.cjs).
const test = require('node:test');
const assert = require('node:assert');
const { parseAccount, parseAccounts } = require('../electron/ytm-parse.cjs');

const thumbs = (...ws) => ({ thumbnails: ws.map((w) => ({ url: `https://yt3.ggpht.com/a${w}=s${w}`, width: w, height: w })) });

test('account menu header -> name, handle, biggest https photo', () => {
  const res = { actions: [{ openPopupAction: { popup: { multiPageMenuRenderer: { header: { activeAccountHeaderRenderer: {
    accountName: { runs: [{ text: 'Ada Lovelace' }] }, channelHandle: { runs: [{ text: '@ada' }] }, accountPhoto: thumbs(48, 88),
  } } } } } }] };
  assert.deepStrictEqual(parseAccount(res), { name: 'Ada Lovelace', handle: '@ada', photo: 'https://yt3.ggpht.com/a88=s88' });
});

test('account menu: email when there is no handle; foreign photo hosts dropped; nothing -> null', () => {
  const res = { activeAccountHeaderRenderer: { accountName: { simpleText: 'Bo' }, email: { simpleText: 'bo@example.com' }, accountPhoto: { thumbnails: [{ url: 'https://evil.example/x.png', width: 99 }] } } };
  assert.deepStrictEqual(parseAccount(res), { name: 'Bo', handle: 'bo@example.com', photo: null });
  assert.strictEqual(parseAccount({}), null);
});

test('accounts list -> every account with its sign-in link, the current one marked', () => {
  const item = (name, selected, url) => ({ accountItem: {
    accountName: { simpleText: name }, accountByline: { simpleText: `${name.toLowerCase()}@x` }, accountPhoto: thumbs(56), isSelected: selected,
    serviceEndpoint: { selectActiveIdentityEndpoint: { supportedTokens: [{ pageIdToken: {} }, { accountSigninToken: { signinUrl: url } }] } },
  } });
  const res = { contents: [{ accountSectionListRenderer: { contents: [{ accountItemSectionRenderer: { contents: [
    item('One', true, '/signin?authuser=0'), item('Two', false, '/signin?authuser=1'), { accountItem: { accountName: { simpleText: 'Broken' } } },
  ] } }] } }] };
  const list = parseAccounts(res);
  assert.deepStrictEqual(list.map((a) => [a.name, a.selected, a.signinUrl, a.byline]), [['One', true, '/signin?authuser=0', 'one@x'], ['Two', false, '/signin?authuser=1', 'two@x']]);
});
