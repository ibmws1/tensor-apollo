from http.server import HTTPServer, SimpleHTTPRequestHandler

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        SimpleHTTPRequestHandler.end_headers(self)

if __name__ == '__main__':
    print('启动服务器在 http://localhost:8000')
    print('按 Ctrl+C 停止服务器')
    HTTPServer(('localhost', 8000), CORSRequestHandler).serve_forever()
