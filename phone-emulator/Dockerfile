FROM python:3
WORKDIR /phone-emulator
COPY requirements.txt .
RUN python -m pip install -r requirements.txt
COPY . .
ENTRYPOINT ["python", "phone_emulator.py"]