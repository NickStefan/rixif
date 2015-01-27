var gulp = require('gulp');
var browserify = require('gulp-browserify');
var concat = require('gulp-concat');

gulp.task('browserify', function(){
  gulp.src('src/js/main.jsx')
  .pipe(browserify({transform: 'reactify'}))
  .pipe(concat('react-spread-sheet.js'))
  .pipe(gulp.dest('dist/js'));
});

gulp.task('copy', function(){
  gulp.src('src/index.html')
  .pipe(gulp.dest('dist'));

  gulp.src('src/css/*')
  .pipe(gulp.dest('dist/css'));
});

gulp.task('default',['browserify','copy']);

gulp.task('watch', function(){
  gulp.watch('src/**/*.*', ['default']);
});
