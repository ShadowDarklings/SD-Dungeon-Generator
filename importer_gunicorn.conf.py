"""Keep browser service startup separate from the web app's database hooks."""

bind = "0.0.0.0:9000"
workers = 1
worker_class = "gthread"
threads = 2
timeout = 45
accesslog = "-"
errorlog = "-"
access_log_format = '%(h)s %(m)s %(U)s %(s)s %(L)s'
