; The drawing library behind every badge. render.js writes one call sequence
; per badge from badges.js, and this file draws it:
;
;   (badge-start sky-centre sky-edge rim-light rim-dark)  rim and sky
;   (flair-...)                                            the badge's scene
;   (badge-duck img duck-path)                             snow, ring and duck
;   (flair-...)                                            props in front of it
;   (badge-finish img emblem-path rim-light rim-dark out)  emblem and export
;
; Everything is drawn on a 1024px canvas. The sky is the circle centred at
; (512, 512) with radius 444, and every scene element is clipped to it, so
; nothing spills onto the rim or past the round crop the site applies.

(define badge-size 1024)
(define sky-x 68)
(define sky-diameter 888)
(define export-size 512)
(define emblem-size 196)

(define (circle-select img op x y d)
  (gimp-image-select-ellipse img op x y d d))

(define (new-layer img name opacity)
  (let ((layer (car (gimp-layer-new img name badge-size badge-size RGBA-IMAGE opacity LAYER-MODE-NORMAL))))
    (gimp-image-insert-layer img layer 0 -1)
    layer))

(define (solid-fill layer colour)
  (gimp-context-set-foreground colour)
  (gimp-drawable-edit-fill layer FILL-FOREGROUND))

; Fills the current selection with a two-colour gradient from (x1,y1) to (x2,y2).
(define (gradient-fill layer type from to x1 y1 x2 y2)
  (gimp-context-set-foreground from)
  (gimp-context-set-background to)
  (gimp-context-set-gradient-fg-bg-rgb)
  (gimp-drawable-edit-gradient-fill layer type 0 FALSE 1 0 TRUE x1 y1 x2 y2))

; Clears everything on `layer` outside the sky, then drops the selection.
(define (clip-to-sky img layer)
  (circle-select img CHANNEL-OP-REPLACE sky-x sky-x sky-diameter)
  (gimp-selection-invert img)
  (gimp-drawable-edit-clear layer)
  (gimp-selection-none img))

(define (badge-start sky-centre sky-edge light dark)
  (let ((img (car (gimp-image-new badge-size badge-size RGB))))
    (let ((rim (new-layer img "rim" 100)))
      (circle-select img CHANNEL-OP-REPLACE 12 12 1000)
      (gradient-fill rim GRADIENT-LINEAR light dark 160 120 880 920)
      (circle-select img CHANNEL-OP-REPLACE 44 44 936)
      (gradient-fill rim GRADIENT-LINEAR dark light 160 120 880 920))
    (let ((sky (new-layer img "sky" 100)))
      (circle-select img CHANNEL-OP-REPLACE sky-x sky-x sky-diameter)
      (gradient-fill sky GRADIENT-RADIAL sky-centre sky-edge 512 440 512 980))
    (gimp-selection-none img)
    img))

; ---- Scene elements -------------------------------------------------------

; Alternating wedges radiating from (cx, cy), like a sunburst.
(define (flair-rays img colour count opacity cx cy)
  (let ((layer (new-layer img "rays" opacity))
        (step (/ (* 2 3.14159265) (* 2 count))))
    (gimp-selection-none img)
    (let loop ((i 0))
      (if (< i count)
        (let* ((a (* 2 i step)) (b (+ a step)) (r 1400))
          (gimp-image-select-polygon img CHANNEL-OP-ADD
            (vector cx cy
                    (+ cx (* r (cos a))) (+ cy (* r (sin a)))
                    (+ cx (* r (cos b))) (+ cy (* r (sin b)))))
          (loop (+ i 1)))))
    (solid-fill layer colour)
    (clip-to-sky img layer)))

(define (flair-ellipse img colour opacity x y w h)
  (let ((layer (new-layer img "ellipse" opacity)))
    (gimp-image-select-ellipse img CHANNEL-OP-REPLACE x y w h)
    (solid-fill layer colour)
    (clip-to-sky img layer)))

(define (flair-ring img colour opacity x y d width)
  (let ((layer (new-layer img "ring" opacity)))
    (circle-select img CHANNEL-OP-REPLACE x y d)
    (gimp-selection-border img width)
    (solid-fill layer colour)
    (clip-to-sky img layer)))

(define (flair-rect img colour opacity x y w h)
  (let ((layer (new-layer img "rect" opacity)))
    (gimp-image-select-rectangle img CHANNEL-OP-REPLACE x y w h)
    (solid-fill layer colour)
    (clip-to-sky img layer)))

(define (flair-polygon img colour opacity points)
  (let ((layer (new-layer img "polygon" opacity)))
    (gimp-image-select-polygon img CHANNEL-OP-REPLACE points)
    (solid-fill layer colour)
    (clip-to-sky img layer)))

; Loads a square icon and scales it to `size`: GIMP loads an SVG at its own
; resolution, not at the size the file declares.
(define (load-icon img path size)
  (let ((layer (car (gimp-file-load-layer RUN-NONINTERACTIVE img path))))
    (gimp-image-insert-layer img layer 0 -1)
    (gimp-layer-scale layer (round size) (round size) FALSE)
    layer))

; Places an icon prop `size` pixels square with its centre at (cx, cy),
; turned `angle` radians about that centre.
(define (flair-image img path size cx cy angle opacity)
  (let ((layer (load-icon img path size)))
    (gimp-layer-set-offsets layer (round (- cx (/ size 2))) (round (- cy (/ size 2))))
    (let ((placed (if (= angle 0)
                    layer
                    (car (gimp-item-transform-rotate layer angle FALSE cx cy)))))
      (gimp-layer-set-opacity placed opacity)
      (clip-to-sky img placed))))

; ---- The parts every badge shares ----------------------------------------

(define (badge-duck img duck)
  ; The same scatter of snowflakes on every badge.
  (let ((snow (new-layer img "snow" 70)))
    (gimp-selection-none img)
    (for-each
      (lambda (flake)
        (circle-select img CHANNEL-OP-ADD (car flake) (cadr flake) (caddr flake)))
      '((190 230 18) (300 140 12) (760 180 16) (850 300 11) (150 470 12)
        (230 650 16) (860 470 13) (380 830 12) (170 360 9) (690 120 9)
        (560 900 10) (120 580 8) (900 390 8) (640 210 7) (250 760 9)))
    (solid-fill snow '(255 255 255)))
  (let ((ring (new-layer img "sky ring" 75)))
    (circle-select img CHANNEL-OP-REPLACE sky-x sky-x sky-diameter)
    (gimp-selection-border img 5)
    (solid-fill ring '(255 255 255)))
  (gimp-selection-none img)
  ; The duck, centred in the medallion.
  (let* ((layer (car (gimp-file-load-layer RUN-NONINTERACTIVE img duck)))
         (w (car (gimp-drawable-get-width layer)))
         (h (car (gimp-drawable-get-height layer)))
         (height 590)
         (width (round (* w (/ height h)))))
    (gimp-image-insert-layer img layer 0 -1)
    (gimp-layer-scale layer width height FALSE)
    (gimp-layer-set-offsets layer (round (- 512 (/ width 2))) (round (- 512 (/ height 2))))))

(define (badge-finish img emblem light dark out)
  (let ((shadow (new-layer img "emblem shadow" 35)))
    (circle-select img CHANNEL-OP-REPLACE 586 592 340)
    (solid-fill shadow '(10 25 50)))
  (let ((bubble (new-layer img "emblem" 100)))
    (circle-select img CHANNEL-OP-REPLACE 574 574 340)
    (gradient-fill bubble GRADIENT-LINEAR light dark 600 590 890 910)
    (circle-select img CHANNEL-OP-REPLACE 598 598 292)
    (gradient-fill bubble GRADIENT-RADIAL '(36 72 128) '(14 31 62) 720 700 744 890))
  (gimp-selection-none img)
  (let ((layer (load-icon img emblem emblem-size)))
    (gimp-layer-set-offsets layer (round (- 744 (/ emblem-size 2))) (round (- 744 (/ emblem-size 2)))))
  (gimp-image-merge-visible-layers img CLIP-TO-IMAGE)
  (gimp-image-scale img export-size export-size)
  (file-png-export #:run-mode RUN-NONINTERACTIVE #:image img #:file out)
  (gimp-image-delete img))

; A grid of finished badges with each name beneath, for reviewing the set.
(define (contact-sheet files names columns cell out)
  (let* ((count (length files))
         (rows (ceiling (/ count columns)))
         (label 56)
         (img (car (gimp-image-new (* columns cell) (* rows (+ cell label)) RGB)))
         (bg (car (gimp-layer-new img "bg" (* columns cell) (* rows (+ cell label)) RGBA-IMAGE 100 LAYER-MODE-NORMAL))))
    (gimp-image-insert-layer img bg 0 0)
    (solid-fill bg '(248 250 252))
    (let loop ((i 0) (fs files) (ns names))
      (if (pair? fs)
        (let* ((col (modulo i columns))
               (row (quotient i columns))
               (x (* col cell))
               (y (* row (+ cell label)))
               (layer (car (gimp-file-load-layer RUN-NONINTERACTIVE img (car fs)))))
          (gimp-image-insert-layer img layer 0 -1)
          (gimp-layer-scale layer (- cell 24) (- cell 24) FALSE)
          (gimp-layer-set-offsets layer (+ x 12) (+ y 12))
          (gimp-context-set-foreground '(30 41 59))
          (let ((text (car (gimp-text-font img -1 0 0 (car ns) 0 TRUE 30 (car (gimp-font-get-by-name "Sans-serif Bold"))))))
            (gimp-layer-set-offsets text
              (round (+ x (/ (- cell (car (gimp-drawable-get-width text))) 2)))
              (+ y cell 4)))
          (loop (+ i 1) (cdr fs) (cdr ns)))))
    (gimp-image-merge-visible-layers img CLIP-TO-IMAGE)
    (file-png-export #:run-mode RUN-NONINTERACTIVE #:image img #:file out)
    (gimp-image-delete img)))
