import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRichText } from '../src/lib/rich-text.ts';

const text = (value, options = {}) => ({type: 'text', value, ...options});
const render = (children) => renderRichText(JSON.stringify({type: 'root', children}));
const paragraph = (children) => ({type: 'paragraph', children});

test('renders links anywhere with mixed formatting and escaped text and attributes', () => {
  assert.equal(render([paragraph([
    text('Before & '), {type: 'link', url: '/charcuterie?x=1&y=2', title: '"Offer"', children: [text('order', {bold:true})]},
    text(' after', {italic:true}),
  ])]), '<p>Before &amp; <a href="/charcuterie?x=1&amp;y=2" title="&quot;Offer&quot;"><strong>order</strong></a><em> after</em></p>');
});

test('supports paragraphs, headings, lists, line breaks and new-tab links', () => {
  assert.equal(render([
    {type:'heading',level:2,children:[text('Title')]},
    paragraph([text('First\nSecond')]),
    {type:'list',listType:'ordered',children:[{type:'list-item',children:[text('One')]}]},
    paragraph([{type:'link',url:'https://example.com',target:'_blank',children:[text('More')]}]),
  ]), '<h2>Title</h2><p>First<br>Second</p><ol><li>One</li></ol><p><a href="https://example.com" target="_blank" rel="noopener noreferrer">More</a></p>');
});

test('does not render executable URLs, arbitrary HTML, attributes or unsupported nodes', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', '//evil.example', '/\\evil.example', '/\t/evil.example']) {
    assert.equal(render([paragraph([{type:'link',url,onclick:'bad()',children:[text('<script>bad</script>')]}])]), '<p>&lt;script&gt;bad&lt;/script&gt;</p>');
  }
  assert.equal(render([{type:'script',children:[text('bad')]}]), null);
  assert.equal(renderRichText('{invalid'), null);
  assert.equal(renderRichText('null'), null);
});

test('supports contact links and prevents nested anchors', () => {
  for (const url of ['mailto:hello@example.com', 'tel:+17035551234']) {
    assert.equal(render([paragraph([{type:'link',url,children:[text('Contact')]}])]), `<p><a href="${url}">Contact</a></p>`);
  }
  assert.equal(render([paragraph([{type:'link',url:'/one',children:[{type:'link',url:'/two',children:[text('One')]}]}])]), '<p><a href="/one">One</a></p>');
});
