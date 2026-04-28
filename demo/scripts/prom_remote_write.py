#!/usr/bin/env python3
"""Minimal Prometheus Remote Write client for backfilling gauge data.

Encodes a WriteRequest protobuf, snappy-compresses it, and POSTs to
Prometheus's /api/v1/write endpoint.

Only depends on: requests, snappy, struct (stdlib).
No protobuf library needed — we hand-encode the simple WriteRequest message.
"""

import struct
import requests
import snappy


def _encode_varint(value):
    """Encode an unsigned varint."""
    parts = []
    while value > 0x7F:
        parts.append((value & 0x7F) | 0x80)
        value >>= 7
    parts.append(value & 0x7F)
    return bytes(parts)


def _encode_field(field_number, wire_type, data):
    """Encode a protobuf field tag + data."""
    tag = _encode_varint((field_number << 3) | wire_type)
    return tag + data


def _encode_string(field_number, value):
    """Encode a length-delimited string field."""
    encoded = value.encode("utf-8")
    return _encode_field(field_number, 2, _encode_varint(len(encoded)) + encoded)


def _encode_label(name, value):
    """Encode a prometheus.Label message: name=1, value=2."""
    inner = _encode_string(1, name) + _encode_string(2, value)
    return inner


def _encode_sample(value, timestamp_ms):
    """Encode a prometheus.Sample message: value=1 (double), timestamp=2 (int64)."""
    inner = _encode_field(1, 1, struct.pack("<d", value))  # double
    inner += _encode_field(2, 0, _encode_varint(timestamp_ms))  # int64 varint
    return inner


def _encode_timeseries(labels, samples):
    """Encode a prometheus.TimeSeries message: labels=1, samples=2."""
    inner = b""
    for name, value in labels:
        label_data = _encode_label(name, value)
        inner += _encode_field(1, 2, _encode_varint(len(label_data)) + label_data)
    for val, ts_ms in samples:
        sample_data = _encode_sample(val, ts_ms)
        inner += _encode_field(2, 2, _encode_varint(len(sample_data)) + sample_data)
    return inner


def _encode_write_request(timeseries_list):
    """Encode a prometheus.WriteRequest message: timeseries=1."""
    inner = b""
    for ts_data in timeseries_list:
        inner += _encode_field(1, 2, _encode_varint(len(ts_data)) + ts_data)
    return inner


def remote_write(prometheus_url, timeseries):
    """Write time series data directly to Prometheus remote write endpoint.

    Args:
        prometheus_url: e.g. "http://localhost:9090"
        timeseries: list of dicts with keys:
            - labels: list of (name, value) tuples (must include __name__)
            - samples: list of (float_value, timestamp_ms) tuples
    """
    encoded_ts = []
    for ts in timeseries:
        encoded_ts.append(_encode_timeseries(ts["labels"], ts["samples"]))

    payload = _encode_write_request(encoded_ts)
    compressed = snappy.compress(payload)

    resp = requests.post(
        f"{prometheus_url}/api/v1/write",
        data=compressed,
        headers={
            "Content-Type": "application/x-protobuf",
            "Content-Encoding": "snappy",
            "X-Prometheus-Remote-Write-Version": "0.1.0",
        },
        timeout=30,
    )
    resp.raise_for_status()
    return len(timeseries)
