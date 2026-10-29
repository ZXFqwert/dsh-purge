// Local-only mock used for end-to-end DSH tests; never stores request content.
import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !(req.url.includes('chat/completions') || req.url.endsWith('/v1/messages'))) {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (part) => { body += part; });
  req.on('end', () => {
    const request = JSON.parse(body);
    const system = [request.system, ...(request.messages || []).filter((m) => m.role === 'system')];
    const history = JSON.stringify(request.messages || []);
    const hasToolResult = history.includes('tool_result');
    const testTool = history.includes('LAB_TOOL_REQUEST');
    const testShell = history.includes('LAB_SHELL_REQUEST');
    console.log(JSON.stringify({ event: 'request', model: request.model, systemMessages: system.length, purgeMarker: JSON.stringify(system).includes('LAB_PURGE_MARKER_021'), stream: request.stream === true, toolResult: hasToolResult, toolFileSeen: history.includes('LAB_TOOL_FILE_OK'), shellOutputSeen: history.includes('LAB_SHELL_OK') }));
    const id = 'chatcmpl-lab';
    if (req.url.endsWith('/v1/messages')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const event = (type, payload) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`);
      event('message_start', { message: { id, type: 'message', role: 'assistant', content: [], model: request.model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } });
      if ((testTool || testShell) && !hasToolResult) {
        const name = testShell ? 'pwsh' : 'read';
        const input = testShell ? { description: 'Print a local test marker', command: "Write-Output 'LAB_SHELL_OK'" } : { file_path: process.env.DSH_LAB_TOOL_FILE || 'tool-test.txt' };
        event('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_lab', name, input: {} } });
        event('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(input) } });
        event('content_block_stop', { index: 0 });
        event('message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1 } });
        event('message_stop', {});
        res.end();
        return;
      }
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'LAB_MODEL_OK' } });
      event('content_block_stop', { index: 0 });
      event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } });
      event('message_stop', {});
      res.end();
      return;
    }
    if (request.stream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const chunk = (delta, finish_reason = null) => ({ id, object: 'chat.completion.chunk', created: 1, model: request.model, choices: [{ index: 0, delta, finish_reason }] });
      res.write(`data: ${JSON.stringify(chunk({ role: 'assistant', content: 'LAB_MODEL_OK' }))}\n\n`);
      res.write(`data: ${JSON.stringify(chunk({}, 'stop'))}\n\n`);
      res.end('data: [DONE]\n\n');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id, object: 'chat.completion', created: 1, model: request.model, choices: [{ index: 0, message: { role: 'assistant', content: 'LAB_MODEL_OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
});
server.listen(31999, '127.0.0.1', () => console.log('mock ready'));
