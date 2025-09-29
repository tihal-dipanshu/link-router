import json

def lambda_handler(event, _ctx):
    body = event.get("body") or "{}"
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            body = {"q": body}
    q = (body or {}).get("q", "")
    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json"
        },
        "body": json.dumps({"messages":[{"text": f"ECHO: {q}"}]})
    }
