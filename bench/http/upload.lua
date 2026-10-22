-- wrk script of the upload16k case: a POST with a 16 KiB body.
wrk.method = "POST"
wrk.body = string.rep("x", 16384)
