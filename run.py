import argparse
from server.app import create_app

if __name__ == "__main__":
    from waitress import serve
    parser = argparse.ArgumentParser(description="Qaras local server")
    parser.add_argument("--port", type=int, default=8011)
    args = parser.parse_args()
    print(f"Qaras: http://127.0.0.1:{args.port}", flush=True)
    serve(create_app(), host="127.0.0.1", port=args.port, threads=4, max_request_body_size=64 * 1024 * 1024)
