import io
import wave
import base64
import threading
from flask import Flask, render_template, request, jsonify, Response
from flask_socketio import SocketIO
from piper import PiperVoice
from piper.config import SynthesisConfig
from gpiozero import Button

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

_MODEL_PATH = 'piper/ne_NP-google-medium.onnx'

tts_voice = PiperVoice.load(_MODEL_PATH)
syn_config = SynthesisConfig(speaker_id=10)


def _synthesize(text):
    if not text.strip():
        return None
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        tts_voice.synthesize_wav(text, wf, syn_config=syn_config)
    data = buf.getvalue()
    with wave.open(io.BytesIO(data), "rb") as chk:
        if chk.getnframes() == 0:
            return None
    return data


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/synthesize', methods=['POST'])
def synthesize():
    text = request.form.get('text', '')
    data = _synthesize(text)
    if data is None:
        return jsonify({"audio_b64": None})
    return jsonify({"audio_b64": base64.b64encode(data).decode("utf-8")})


@app.route('/synthesize-raw', methods=['POST'])
def synthesize_raw():
    text = request.form.get('text', '')
    data = _synthesize(text)
    if data is None:
        return '', 204
    return Response(data, mimetype='audio/wav')


# ── GPIO button → push to browser via SocketIO ──────────────────────────────
button = Button(17)

def on_button_pressed():
    print("Button pressed — trigger mic")
    socketio.emit('mic_trigger')

button.when_pressed = on_button_pressed


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)