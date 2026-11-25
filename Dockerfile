FROM python:3.13-slim
WORKDIR /app
# az anthropic csomag csak az opcionális AI-értelmezéshez kell
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py .
COPY web ./web
ENV HOST=0.0.0.0 PORT=8778 PYTHONUNBUFFERED=1
EXPOSE 8778
USER nobody
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8778/healthz')"
CMD ["python", "-I", "server.py"]
