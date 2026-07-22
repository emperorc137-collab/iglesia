# Desplegar el servidor central de verificación

Arquitectura:

```
Internet ── Cloudflare DNS ── Cloudflare Tunnel ── tu red Wi-Fi ── Computador anfitrión
                                                                          │
                                                                    Máquina Virtual (VM)
                                                                          │
                                                                Servidor web (Flask + gunicorn)
```

El túnel es el único punto de entrada: nunca abras puertos en tu router hacia
esta VM. Cloudflare termina el TLS y reenvía tráfico HTTPS al túnel, que
entrega al proceso Flask solo en `127.0.0.1`.

## 1. Preparar la VM

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

export RAMA_ADMIN_TOKEN="genera-un-token-largo-y-aleatorio-aqui"
export RAMA_DB_PATH="/var/lib/rama-network/rama_network.db"
mkdir -p /var/lib/rama-network

gunicorn -w 2 -b 127.0.0.1:8420 app:app
```

Guarda `RAMA_ADMIN_TOKEN` en un gestor de contraseñas — es la llave maestra
para aprobar o revocar ramas. No la compartas ni la subas a git.

## 2. Crear la rama fundadora manualmente

La primera rama no tiene a nadie que la invite, así que se inserta a mano:

```bash
sqlite3 /var/lib/rama-network/rama_network.db <<'SQL'
INSERT INTO branches (id, name, location, district, lat, lng, status, api_key_hash, created_at, approved_at)
VALUES ('bosque-sincelejo', 'Rama Bosque', 'Sincelejo, Sucre, Colombia', 'Distrito Sincelejo',
        9.3047, -75.3978, 'approved', 'REEMPLAZA_CON_EL_HASH_SHA256_DE_TU_API_KEY',
        datetime('now'), datetime('now'));
SQL
```

Para generar la API key y su hash correspondiente:

```bash
python3 -c "
import secrets, hashlib
key = 'rrk_' + secrets.token_urlsafe(32)
print('API key (guárdala, no se puede recuperar):', key)
print('hash a insertar en la BD:', hashlib.sha256(key.encode()).hexdigest())
"
```

## 3. Instalar y configurar `cloudflared`

```bash
cloudflared tunnel login
cloudflared tunnel create rama-network
cloudflared tunnel route dns rama-network api.tu-dominio.org
```

Archivo `~/.cloudflared/config.yml`:

```yaml
tunnel: rama-network
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: api.tu-dominio.org
    service: http://127.0.0.1:8420
  - service: http_status:404
```

```bash
cloudflared tunnel run rama-network
```

Corre tanto `gunicorn` como `cloudflared` como servicios systemd para que
sobrevivan a reinicios (plantillas de unit files abajo).

## 4. Servicios systemd

`/etc/systemd/system/rama-api.service`:

```ini
[Unit]
Description=Rama Network API
After=network.target

[Service]
User=rama
WorkingDirectory=/opt/rama-backend
Environment="RAMA_ADMIN_TOKEN=tu-token-aqui"
Environment="RAMA_DB_PATH=/var/lib/rama-network/rama_network.db"
ExecStart=/opt/rama-backend/venv/bin/gunicorn -w 2 -b 127.0.0.1:8420 app:app
Restart=always

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/cloudflared.service` — usa la plantilla que genera
`cloudflared service install`.

```bash
systemctl enable --now rama-api
systemctl enable --now cloudflared
```

## 5. Administrar ramas

```bash
# Ver ramas pendientes
curl -H "X-Admin-Token: $RAMA_ADMIN_TOKEN" https://api.tu-dominio.org/admin/branches

# Aprobar una rama
curl -X POST -H "X-Admin-Token: $RAMA_ADMIN_TOKEN" \
  https://api.tu-dominio.org/admin/branches/<branch_id>/approve

# Revocar una rama fraudulenta
curl -X POST -H "X-Admin-Token: $RAMA_ADMIN_TOKEN" \
  https://api.tu-dominio.org/admin/branches/<branch_id>/revoke
```

## Notas de seguridad

- Las API keys se muestran una sola vez al registrarse; el servidor solo
  guarda su hash SHA-256. Si una rama la pierde, debes revocar y volver a
  invitarla.
- El rate limiting en `app.py` es por IP y en memoria — suficiente para el
  volumen esperado de una red de ramas, pero si crece mucho, mover a Redis.
- `flask-cors` está abierto por defecto; si quieres restringir orígenes,
  pásale `origins=["https://tu-frontend.org"]` en `CORS(app, origins=...)`.
- Considera poner Cloudflare en modo "Under Attack" o añadir un WAF rule
  simple sobre `/branches/register` si ves abuso.
