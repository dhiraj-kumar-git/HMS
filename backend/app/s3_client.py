import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from urllib.parse import urlparse, urlunparse

S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL', 'http://localstack:4566')
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID', 'test')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY', 'test')
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
BUCKET = os.getenv('S3_BUCKET', 'hms-lab-reports')

# S3_PUBLIC_URL is the host the BROWSER uses to reach MinIO (e.g. http://localhost:9000).
# It may differ from S3_ENDPOINT_URL which is the internal Docker hostname (e.g. http://minio:9000).
S3_PUBLIC_URL = os.getenv('S3_PUBLIC_URL', '')

# Override region to us-east-1 for local MinIO/localhost endpoints to prevent 403 region mismatches.
# MinIO always treats the region as us-east-1 unless explicitly configured otherwise.
effective_region = AWS_REGION
if any(local_k in S3_ENDPOINT_URL.lower() for local_k in ['localhost', '127.0.0.1', 'minio']):
    effective_region = 'us-east-1'

_CLIENT_CONFIG = Config(
    s3={'addressing_style': 'path'},
    signature_version='s3v4',
    request_checksum_calculation='when_required'
)

# Primary S3 client — used for all bucket-management operations (create, list, delete, etc.)
# Uses the internal endpoint so it works inside Docker networking.
s3 = boto3.client(
    's3',
    endpoint_url=S3_ENDPOINT_URL,
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=effective_region,
    config=_CLIENT_CONFIG
)

# Presigned-URL client — used ONLY for generate_presigned_url() calls.
#
# CRITICAL: AWS V4 presigned URLs sign the "host" header. If the URL is generated
# against the internal endpoint (minio:9000) and then the browser hits localhost:9000,
# the host header won't match the signed value → MinIO returns 403 Forbidden.
#
# Solution: generate presigned URLs against the PUBLIC endpoint so the signed host
# matches exactly what the browser sends.
_presign_endpoint = S3_PUBLIC_URL if S3_PUBLIC_URL else S3_ENDPOINT_URL
_s3_presign = boto3.client(
    's3',
    endpoint_url=_presign_endpoint,
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    region_name=effective_region,
    config=_CLIENT_CONFIG
)

print(f"[S3] Operations endpoint : {S3_ENDPOINT_URL}")
print(f"[S3] Presigned URL endpoint: {_presign_endpoint}")
print(f"[S3] Effective region       : {effective_region}")


def generate_presigned_url(operation, params, expires_in=600):
    """Generate a presigned URL that is directly usable by the browser.

    Always uses the public-facing endpoint so the signed ``host`` header
    matches what the browser will send when it performs the upload.
    """
    return _s3_presign.generate_presigned_url(
        operation,
        Params=params,
        ExpiresIn=expires_in
    )


def get_public_s3_url(presigned_url):
    """(Legacy helper) Replace the internal MinIO host in a presigned URL with
    the public-facing URL.

    This is no longer needed now that we generate presigned URLs against the
    public endpoint directly, but kept for backwards-compatibility.
    """
    if not S3_PUBLIC_URL:
        return presigned_url

    parsed_presigned = urlparse(presigned_url)
    parsed_public = urlparse(S3_PUBLIC_URL)

    replaced = parsed_presigned._replace(
        scheme=parsed_public.scheme,
        netloc=parsed_public.netloc
    )
    return urlunparse(replaced)


# ---------------------------------------------------------------------------
# Bucket initialisation — runs once at app startup
# ---------------------------------------------------------------------------

def _ensure_bucket():
    """Create the bucket if it does not exist.

    Note: MinIO's newer versions do not implement the S3 PutBucketCors API.
    CORS is instead configured globally via the MINIO_API_CORS_ALLOW_ORIGIN
    environment variable in docker-compose.yml, which handles browser preflight
    requests at the server level.
    """
    try:
        s3.create_bucket(Bucket=BUCKET)
        print(f"[S3] Bucket '{BUCKET}' created successfully.")
    except ClientError as e:
        code = e.response.get('Error', {}).get('Code', '')
        if code not in ('BucketAlreadyOwnedByYou', 'BucketAlreadyExists'):
            print(f"[S3] Warning: could not create bucket '{BUCKET}': {e}")
    except Exception as e:
        print(f"[S3] Warning: could not create bucket '{BUCKET}': {e}")


_ensure_bucket()
