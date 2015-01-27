var gulp = require('gulp');
var browserify = require('gulp-browserify');
var concat = require('gulp-concat');
var rename = require('gulp-rename');

gulp.task('browserify', function(){
  
  /* example init */
  gulp.src('src/js/example-init.js')
  .pipe(browserify({transform: 'reactify'}))
  .pipe(concat('example-init.js'))
  .pipe(gulp.dest('dist/js'));

  /* rx-spread-sheet-noRequire */
  gulp.src('src/js/noRequire.js')
  .pipe(browserify({transform: 'reactify'}))
  .pipe(concat('rx-speed-sheet-noRequire.js'))
  .pipe(gulp.dest('dist/js'));

  /* rx-spread-sheet for require */
  gulp.src('src/js/rx-speed-sheet.js')
  .pipe(browserify({transform: 'reactify'}))
  .pipe(concat('rx-speed-sheet.js'))
  .pipe(gulp.dest('dist/js'));

});

gulp.task('copy', function(){
  gulp.src('src/index.html')
  .pipe(gulp.dest('dist'));

  gulp.src('src/css/*')
  .pipe(gulp.dest('dist/css'));

  gulp.src('dist/js/rx-speed-sheet.js')
  .pipe(rename('index.js'))
  .pipe(gulp.dest('./'));
});

gulp.task('default',['browserify','copy']);

gulp.task('watch', function(){
  gulp.watch('src/**/*.*', ['default']);
});
