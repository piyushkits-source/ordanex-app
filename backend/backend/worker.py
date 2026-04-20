import time
from backend.db.database import SessionLocal
from backend.services.job_service import claim_next_job, mark_job_failed, mark_job_success
from backend.services.job_handlers import handle_upload_file_parse, handle_generate_xml, handle_reprocess_po, handle_send_notification

JOB_HANDLERS = {
    "UPLOAD_FILE_PARSE": handle_upload_file_parse,
    "GENERATE_XML": handle_generate_xml,
    "REPROCESS_PO": handle_reprocess_po,
    "SEND_NOTIFICATION": handle_send_notification,
}

def run_worker(poll_interval_seconds: int = 3):
    print("Background worker started...")
    while True:
        db = SessionLocal()
        try:
            job = claim_next_job(db)
            if not job:
                db.close()
                time.sleep(poll_interval_seconds)
                continue
            print(f"Processing job {job.job_id} | type={job.job_type}")
            handler = JOB_HANDLERS.get(job.job_type)
            if not handler:
                mark_job_failed(db, job, f"No handler found for job type {job.job_type}")
                db.close()
                continue
            result = handler(db, job)
            mark_job_success(db, job, result_json=result)
            print(f"Job {job.job_id} completed successfully")
        except Exception as e:
            try:
                if 'job' in locals() and job is not None:
                    mark_job_failed(db, job, str(e))
            except Exception:
                pass
            print(f"Worker error: {e}")
        finally:
            db.close()

if __name__ == "__main__":
    run_worker()
